import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { treatNonConformity, listFindingActions, TreatmentError, type TreatInput } from "@/lib/finding-treatment";

// GET /api/nonconformities/[id] → historial de tratamiento de un hallazgo puntual.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ actions: await listFindingActions(id) });
}

// PATCH /api/nonconformities/[id] → tratar un hallazgo: editar o transicionar estado.
// Reusa `close_nc` (definido en permissions.ts, hasta ahora sin ningún endpoint
// que lo verificara) — es el permiso ya pensado para cerrar no-conformidades.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!can(user.role, "close_nc")) {
    return NextResponse.json({ error: "Sin permiso para tratar hallazgos" }, { status: 403 });
  }

  const b = await req.json().catch(() => null);
  if (!b?.action || !["status_change", "edit"].includes(b.action)) {
    return NextResponse.json({ error: "Falta action ('status_change' | 'edit')" }, { status: 400 });
  }

  const input: TreatInput =
    b.action === "status_change"
      ? { id, action: "status_change", toStatus: b.toStatus, treatmentOutcome: b.treatmentOutcome, note: b.note }
      : { id, action: "edit", description: b.description, severity: b.severity, findingType: b.findingType, note: b.note };

  try {
    const row = await treatNonConformity(input, { displayName: user.displayName, role: user.role });
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof TreatmentError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
