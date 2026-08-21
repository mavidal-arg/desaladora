import { NextResponse } from "next/server";
import { pi, sap } from "@/lib/adapters";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { PLANT, flId } from "@/lib/plant-config";

// GET /api/assets → equipment list + hierarchical tree (for the Equipment explorer).
export async function GET() {
  const [equipment, tree] = await Promise.all([
    sap.listEquipment(),
    pi.getAssetTree(),
  ]);
  return NextResponse.json({ equipment, tree });
}

// POST /api/assets → alta de equipo (Maestro de Equipos). Solo Supervisor (edit_equipment).
export async function POST(req: Request) {
  try {
    await requireAuth("Supervisor");
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "No autorizado" }, { status: err.status ?? 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "").trim();
  if (!code || !name || !category) {
    return NextResponse.json({ error: "Código, nombre y categoría son obligatorios" }, { status: 400 });
  }

  const existing = await prisma.equipment.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: `Ya existe un equipo con código ${code}` }, { status: 409 });

  const area = PLANT.areas.find((a) => a.code === String(body.areaCode ?? "").trim());
  const manufacturer = (String(body.manufacturer ?? "").trim()) || "—";
  const model = (String(body.model ?? "").trim()) || "—";
  const criticality = ["low", "medium", "high", "critical"].includes(body.criticality) ? body.criticality : "medium";
  const status = ["running", "stopped", "maintenance", "idle"].includes(body.status) ? body.status : "running";
  const now = new Date();
  const id = `eq_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  const created = await prisma.equipment.create({
    data: {
      id, code, name, category,
      location: area ? `${area.name} — ${name}` : name,
      functionalLocationId: area ? flId(area.code) : null,
      manufacturer, model,
      serialNumber: `${manufacturer.slice(0, 2).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
      installDate: now, commissionDate: now, warrantyExpiry: new Date(now.getTime() + 365 * 86400000),
      specs: {},
      criticality, status,
    },
  });
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
