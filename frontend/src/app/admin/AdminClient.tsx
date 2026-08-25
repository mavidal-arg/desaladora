"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, RotateCcw, X, Check, Upload, Download, Copy, PackagePlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl, cn } from "@/lib/utils";
import { esImagen, iniciales } from "@/lib/brand";
import { slugificar, SLUG_RE, type Paquete } from "@/lib/clone-package";
import type { PlantConfig, EquipmentDef, EquipmentKind } from "@/lib/plant-config";

const KINDS: EquipmentKind[] = ["debarker","chipper","conveyor","pile","silo","impregnation","digester","tank","washer","screen","o2reactor","dryer","evaporator","recovery_boiler","power_boiler","lime_kiln","causticizer","turbogen","pump","fan"];
const STATUSES = ["running","idle","maintenance","stopped"] as const;
const CRITS = ["low","medium","high","critical"] as const;
const LOGO_MAX = 200 * 1024;

const clone = (c: PlantConfig): PlantConfig => JSON.parse(JSON.stringify(c));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}
const inputCls = "rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]";

type Draft = EquipmentDef & { _sigKey: string; _sigLabel: string; _sigUnit: string; _sigBase: number; _sigAmp: number };

function toDraft(e: EquipmentDef): Draft {
  const s = e.signals.find((x) => x.signal === e.primarySignal) ?? e.signals[0];
  return { ...e, _sigKey: s?.signal ?? "value", _sigLabel: s?.label ?? "Valor", _sigUnit: s?.unit ?? "", _sigBase: s?.base ?? 0, _sigAmp: s?.amp ?? 1 };
}
function emptyDraft(areaCode: string): Draft {
  return { code: "", name: "", kind: "pump", areaCode, category: "Pumps", criticality: "medium", status: "running", health: 90, runtime: 0, manufacturer: "", model: "", specs: {}, mimic: { x: 0, y: 0 }, primarySignal: "value", signals: [], help: "", _sigKey: "value", _sigLabel: "Valor", _sigUnit: "", _sigBase: 0, _sigAmp: 1 };
}
function fromDraft(d: Draft): EquipmentDef {
  const sig = { signal: d._sigKey, label: d._sigLabel, unit: d._sigUnit, base: Number(d._sigBase), amp: Number(d._sigAmp) };
  // preserva señales extra, reemplaza/inserta la primaria
  const others = (d.signals ?? []).filter((s) => s.signal !== d._sigKey && s.signal !== d.primarySignal);
  return {
    code: d.code.trim(), name: d.name.trim(), kind: d.kind, areaCode: d.areaCode, category: d.category, criticality: d.criticality,
    status: d.status, health: Number(d.health), runtime: Number(d.runtime) || 0, manufacturer: d.manufacturer, model: d.model,
    specs: d.specs ?? {}, mimic: { x: Number(d.mimic.x), y: Number(d.mimic.y) }, primarySignal: d._sigKey,
    signals: [sig, ...others], help: d.help ?? "",
  };
}

/** Lee un archivo de imagen a data URI, con tope de tamaño. */
function leerLogo(file: File, onOk: (dataUri: string) => void) {
  if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(file.type)) {
    toast.error("Formato no soportado. Usá PNG, SVG, JPG o WEBP.");
    return;
  }
  if (file.size > LOGO_MAX) {
    toast.error(`El archivo pesa ${Math.round(file.size / 1024)} KB y el tope son 200 KB.`);
    return;
  }
  const fr = new FileReader();
  fr.onload = () => onOk(String(fr.result));
  fr.onerror = () => toast.error("No se pudo leer el archivo.");
  fr.readAsDataURL(file);
}

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Vista previa del logo sobre fondo claro y oscuro (el mismo archivo va a los dos). */
function LogoPreview({ logo, client, short }: { logo: string; client: string; short: string }) {
  const cuerpo = esImagen(logo)
    ? // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="Logo" className="h-10 w-auto max-w-[120px] object-contain" />
    : <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>{iniciales(client) || short.slice(0, 2)}</div>;
  return (
    <div className="flex gap-2">
      <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-white p-3">{cuerpo}</div>
      <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-[#0D0D0D] p-3">{cuerpo}</div>
    </div>
  );
}

export function AdminClient({ initial }: { initial: PlantConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<PlantConfig>(() => clone(initial));
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(initial), [cfg, initial]);

  function patchPlant(k: keyof PlantConfig["plant"], v: string) { setCfg((c) => ({ ...c, plant: { ...c.plant, [k]: v } })); }
  function patchFlag<K extends keyof PlantConfig["flags"]>(k: K, v: PlantConfig["flags"][K]) { setCfg((c) => ({ ...c, flags: { ...c.flags, [k]: v } })); }
  function patchBrand(k: keyof PlantConfig["branding"], v: string) { setCfg((c) => ({ ...c, branding: { ...c.branding, [k]: v } })); }
  function patchApp(k: keyof PlantConfig["app"], v: string) { setCfg((c) => ({ ...c, app: { ...c.app, [k]: v } })); }

  function saveEquipment(d: Draft) {
    if (!d.code.trim() || !d.name.trim()) { toast.error("Código y nombre son obligatorios"); return; }
    const eq = fromDraft(d);
    setCfg((c) => {
      const exists = c.equipment.some((e) => e.code === eq.code);
      const list = isNew
        ? (exists ? c.equipment : [...c.equipment, eq])
        : c.equipment.map((e) => (e.code === eq.code ? eq : e));
      if (isNew && exists) toast.error(`Ya existe un equipo con código ${eq.code}`);
      return { ...c, equipment: list };
    });
    setEditing(null); setIsNew(false);
  }
  function removeEquipment(code: string) { setCfg((c) => ({ ...c, equipment: c.equipment.filter((e) => e.code !== code) })); }

  async function persist() {
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/plant-config"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "No se pudo guardar"); return; }
      toast.success(`Config guardada · ${data.equipment} equipos`);
      router.refresh();
    } catch { toast.error("Error de red"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          Editá la planta y guardá para que el <b className="text-foreground">mímico</b> y las <b className="text-foreground">vistas</b> reflejen los cambios. Este es el motor de replicación: clonar y editar esta config = nueva planta.
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={!dirty || saving} onClick={() => setCfg(clone(initial))}
            className={cn("inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40")}>
            <RotateCcw className="size-3.5" /> Descartar
          </button>
          <button type="button" disabled={!dirty || saving} onClick={persist}
            className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40")}
            style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
            <Save className="size-3.5" /> {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <Tabs defaultValue="planta" className="space-y-4">
        <TabsList>
          <TabsTrigger value="planta">Planta</TabsTrigger>
          <TabsTrigger value="identidad">Identidad de la app</TabsTrigger>
          <TabsTrigger value="clonar">Duplicar para un cliente</TabsTrigger>
        </TabsList>

        {/* ── PLANTA ─────────────────────────────────────────────────────── */}
        <TabsContent value="planta" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Identidad de planta</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre"><input className={inputCls} value={cfg.plant.name} onChange={(e) => patchPlant("name", e.target.value)} /></Field>
                <Field label="Empresa"><input className={inputCls} value={cfg.plant.company} onChange={(e) => patchPlant("company", e.target.value)} /></Field>
                <Field label="Producto"><input className={inputCls} value={cfg.plant.product} onChange={(e) => patchPlant("product", e.target.value)} /></Field>
                <Field label="Capacidad"><input className={inputCls} value={cfg.plant.capacity} onChange={(e) => patchPlant("capacity", e.target.value)} /></Field>
                <Field label="Ubicación"><input className={inputCls} value={cfg.plant.location} onChange={(e) => patchPlant("location", e.target.value)} /></Field>
                <Field label="Puesta en marcha"><input className={inputCls} value={cfg.plant.commissioned} onChange={(e) => patchPlant("commissioned", e.target.value)} /></Field>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Proceso</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fase operativa">
                  <select className={inputCls} value={cfg.flags.phase} onChange={(e) => patchFlag("phase", Number(e.target.value))}>
                    <option value={1}>Fase 1</option><option value={2}>Fase 2</option><option value={3}>Fase 3</option>
                  </select>
                </Field>
                <Field label="Caudal captación (l/s)"><input type="number" className={inputCls} value={cfg.flags.phaseLs} onChange={(e) => patchFlag("phaseLs", Number(e.target.value))} /></Field>
                <Field label="Recuperación de energía (ERI)">
                  <select className={inputCls} value={String(cfg.flags.eri)} onChange={(e) => patchFlag("eri", e.target.value === "true")}>
                    <option value="true">Instalada</option><option value="false">Sin ERI</option>
                  </select>
                </Field>
                <Field label="Recovery objetivo (%)"><input type="number" className={inputCls} value={cfg.flags.recoveryPct} onChange={(e) => patchFlag("recoveryPct", Number(e.target.value))} /></Field>
              </div>
            </section>
          </div>

          {/* Equipos */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Equipos <span className="font-mono text-muted-foreground">({cfg.equipment.length})</span></h3>
              <button type="button" onClick={() => { setEditing(emptyDraft(cfg.areas[0]?.code ?? "")); setIsNew(true); }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <Plus className="size-3.5" /> Agregar equipo
              </button>
            </div>

            {editing && (
              <EquipmentForm draft={editing} areas={cfg.areas.map((a) => a.code)} isNew={isNew}
                onCancel={() => { setEditing(null); setIsNew(false); }} onSave={saveEquipment} onChange={setEditing} />
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Tipo</th>
                    <th className="px-2 py-1.5">Área</th><th className="px-2 py-1.5">Estado</th><th className="px-2 py-1.5 text-right">Salud</th><th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.equipment.map((e) => (
                    <tr key={e.code} className="border-t border-border">
                      <td className="px-2 py-2 font-mono text-xs font-semibold">{e.code}</td>
                      <td className="px-2 py-2 text-xs">{e.name}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{e.kind}</td>
                      <td className="px-2 py-2 font-mono text-xs">{e.areaCode}</td>
                      <td className="px-2 py-2 text-xs">{e.status}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-xs">{e.health}%</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label="Editar" onClick={() => { setEditing(toDraft(e)); setIsNew(false); }} className="rounded-md border border-border p-1 hover:border-[var(--primary)] hover:text-[var(--primary)]"><Pencil className="size-3.5" /></button>
                          <button type="button" aria-label="Eliminar" onClick={() => removeEquipment(e.code)} className="rounded-md border border-border p-1 hover:border-red-500 hover:text-red-500"><Trash2 className="size-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        {/* ── IDENTIDAD DE LA APP ────────────────────────────────────────── */}
        <TabsContent value="identidad">
          <IdentidadTab cfg={cfg} onApp={patchApp} onBrand={patchBrand} />
        </TabsContent>

        {/* ── CLONAR ────────────────────────────────────────────────────── */}
        <TabsContent value="clonar">
          <ClonarTab actual={initial} dirty={dirty} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Identidad de la APLICACIÓN. Hasta ahora `branding.primary/accent/logo` se
 * editaban acá y no los leía nadie: se guardaban en la DB y no llegaban a
 * ninguna pantalla. Con `BrandProvider` cableado, lo de esta pestaña se ve en la
 * barra lateral, el login, la vista de terreno y la pestaña del navegador.
 */
function IdentidadTab({
  cfg, onApp, onBrand,
}: {
  cfg: PlantConfig;
  onApp: (k: keyof PlantConfig["app"], v: string) => void;
  onBrand: (k: keyof PlantConfig["branding"], v: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Cómo se llama la aplicación</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Lo que se ve en la barra lateral, la pantalla de acceso y la pestaña del navegador.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" hint="Título grande del login"><input className={inputCls} value={cfg.app.name} onChange={(e) => onApp("name", e.target.value)} /></Field>
          <Field label="Nombre corto" hint="Pestaña del navegador"><input className={inputCls} value={cfg.app.shortName} onChange={(e) => onApp("shortName", e.target.value)} /></Field>
          <Field label="Cliente" hint="Encabezado de la barra"><input className={inputCls} value={cfg.app.client} onChange={(e) => onApp("client", e.target.value)} /></Field>
          <Field label="Sitio / planta"><input className={inputCls} value={cfg.app.site} onChange={(e) => onApp("site", e.target.value)} /></Field>
          <Field label="Bajada" hint="Línea bajo el título del login"><input className={inputCls} value={cfg.app.tagline} onChange={(e) => onApp("tagline", e.target.value)} /></Field>
          <Field label="Pie"><input className={inputCls} value={cfg.app.footer} onChange={(e) => onApp("footer", e.target.value)} /></Field>
          <Field label="Identificador (URL)" hint={`Esta instancia se sirve en /${cfg.app.slug}-ops/ — cambiarlo acá NO mueve la URL: eso se hace clonando.`}>
            <input className={cn(inputCls, "font-mono")} value={cfg.app.slug} onChange={(e) => onApp("slug", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Marca</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          El logo se guarda dentro de la configuración, así que viaja con el paquete del clon. Máximo 200 KB.
        </p>

        <div className="space-y-3">
          <LogoPreview logo={cfg.branding.logo} client={cfg.app.client} short={cfg.app.shortName} />

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-[var(--primary)] hover:text-[var(--primary)]">
              <Upload className="size-3.5" /> Subir logo
              <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) leerLogo(f, (uri) => onBrand("logo", uri)); e.target.value = ""; }} />
            </label>
            {esImagen(cfg.branding.logo) && (
              <button type="button" onClick={() => onBrand("logo", "")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-red-500 hover:text-red-500">
                <Trash2 className="size-3.5" /> Quitar logo
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Color primario">
              <div className="flex gap-2">
                <input type="color" className="h-8 w-10 rounded border border-border bg-background" value={/^#[0-9a-f]{6}$/i.test(cfg.branding.primary) ? cfg.branding.primary : "#0091D5"} onChange={(e) => onBrand("primary", e.target.value)} />
                <input className={cn(inputCls, "flex-1 font-mono")} value={cfg.branding.primary} onChange={(e) => onBrand("primary", e.target.value)} />
              </div>
            </Field>
            <Field label="Color acento" hint="Botones, estado activo y resaltados">
              <div className="flex gap-2">
                <input type="color" className="h-8 w-10 rounded border border-border bg-background" value={/^#[0-9a-f]{6}$/i.test(cfg.branding.accent) ? cfg.branding.accent : "#00A9E0"} onChange={(e) => onBrand("accent", e.target.value)} />
                <input className={cn(inputCls, "flex-1 font-mono")} value={cfg.branding.accent} onChange={(e) => onBrand("accent", e.target.value)} />
              </div>
            </Field>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">Así queda el acento:</p>
            <div className="flex items-center gap-2">
              <span className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ background: cfg.branding.accent, color: "var(--accent-foreground)" }}>Botón principal</span>
              <span className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: cfg.branding.primary, color: cfg.branding.primary }}>Secundario</span>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              Los colores se aplican al guardar (se recarga la config del servidor).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

type FormClon = {
  client: string; site: string; name: string; shortName: string;
  tagline: string; footer: string; slug: string; port: number;
  plantName: string; plantCompany: string; plantLocation: string;
  logo: string; primary: string; accent: string;
};

/**
 * Asistente de alta de un cliente nuevo.
 *
 * No despliega: junta y valida, y devuelve el paquete que ejecuta
 * `deploy/clone.sh` en el host. La app corre en un contenedor sin acceso al
 * Docker del servidor — y dárselo significaría que esta misma pantalla pudiera
 * crear y borrar contenedores.
 */
function ClonarTab({ actual, dirty }: { actual: PlantConfig; dirty: boolean }) {
  const [f, setF] = useState<FormClon>({
    client: "", site: "", name: actual.app.name, shortName: actual.app.shortName,
    tagline: actual.app.tagline, footer: "", slug: "", port: 18100,
    plantName: "", plantCompany: "", plantLocation: "",
    logo: actual.branding.logo, primary: actual.branding.primary, accent: actual.branding.accent,
  });
  const [slugTocado, setSlugTocado] = useState(false);
  const [paquete, setPaquete] = useState<Paquete | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<FormClon>) => setF((prev) => ({ ...prev, ...patch }));

  // El identificador se deriva de cliente + sitio hasta que alguien lo edite a mano.
  function setIdentidad(patch: Partial<FormClon>) {
    const next = { ...f, ...patch };
    setF(slugTocado ? next : { ...next, slug: slugificar(next.client, next.site) });
  }

  const slugValido = SLUG_RE.test(f.slug);
  const chocaConEsta = f.slug === actual.app.slug;
  const listo = Boolean(f.client.trim() && f.name.trim() && slugValido && !chocaConEsta);

  async function generar() {
    setBusy(true);
    setPaquete(null);
    try {
      const res = await fetch(apiUrl("/api/clone"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app: {
            name: f.name.trim(), shortName: f.shortName.trim() || f.name.trim().slice(0, 4),
            client: f.client.trim(), site: f.site.trim(), slug: f.slug.trim(),
            tagline: f.tagline.trim(), footer: (f.footer || `${f.client} · ${f.site}`).trim(),
          },
          branding: { ...actual.branding, logo: f.logo, primary: f.primary, accent: f.accent },
          plant: {
            name: f.plantName.trim() || f.site.trim() || actual.plant.name,
            company: f.plantCompany.trim() || f.client.trim(),
            location: f.plantLocation.trim() || actual.plant.location,
          },
          port: Number(f.port),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "No se pudo generar el paquete"); return; }
      setPaquete(data as Paquete);
      toast.success(`Paquete de ${f.client} listo`);
    } catch { toast.error("Error de red"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Dar de alta a un cliente nuevo</h3>
        <p className="text-xs text-muted-foreground">
          El clon nace con <b className="text-foreground">el catálogo que hoy tiene esta instancia</b> — {actual.areas.length} áreas
          y {actual.equipment.length} equipos, incluidas las ediciones guardadas — y con la identidad que cargues acá.
          Después se edita en su propia Administración.
        </p>
        {dirty && (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
            Tenés cambios sin guardar. El paquete se arma con lo que está <b>guardado en el servidor</b>: guardá primero si querés que viajen.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Identidad</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente *"><input className={inputCls} value={f.client} placeholder="Aguas Andinas" onChange={(e) => setIdentidad({ client: e.target.value })} /></Field>
            <Field label="Sitio / planta"><input className={inputCls} value={f.site} placeholder="Planta Norte" onChange={(e) => setIdentidad({ site: e.target.value })} /></Field>
            <Field label="Nombre de la app *"><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Nombre corto"><input className={inputCls} value={f.shortName} onChange={(e) => set({ shortName: e.target.value })} /></Field>
            <Field label="Bajada"><input className={inputCls} value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
            <Field label="Pie" hint="Vacío = «Cliente · Sitio»"><input className={inputCls} value={f.footer} onChange={(e) => set({ footer: e.target.value })} /></Field>
          </div>

          <h3 className="mb-3 mt-4 text-sm font-semibold">Planta</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre de planta"><input className={inputCls} value={f.plantName} placeholder={f.site || actual.plant.name} onChange={(e) => set({ plantName: e.target.value })} /></Field>
            <Field label="Empresa"><input className={inputCls} value={f.plantCompany} placeholder={f.client || actual.plant.company} onChange={(e) => set({ plantCompany: e.target.value })} /></Field>
            <Field label="Ubicación"><input className={inputCls} value={f.plantLocation} placeholder={actual.plant.location} onChange={(e) => set({ plantLocation: e.target.value })} /></Field>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Dónde vive</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Identificador *" hint="minúsculas, números y guiones">
                <input className={cn(inputCls, "font-mono")} value={f.slug}
                  onChange={(e) => { setSlugTocado(true); set({ slug: e.target.value.toLowerCase() }); }} />
              </Field>
              <Field label="Puerto (loopback)" hint="Propuesto: lo verifica el script">
                <input type="number" className={cn(inputCls, "font-mono")} value={f.port} onChange={(e) => set({ port: Number(e.target.value) })} />
              </Field>
            </div>

            {f.slug && !slugValido && (
              <p className="mt-2 text-xs text-red-400">
                Entre 3 y 40 caracteres, sin empezar ni terminar con guión.
              </p>
            )}
            {chocaConEsta && (
              <p className="mt-2 text-xs text-red-400">
                Ese es el identificador de esta misma instancia: el clon le pisaría el contenedor y la base.
              </p>
            )}
            {slugValido && !chocaConEsta && (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted-foreground">URL</dt><dd>/{f.slug}-ops/</dd>
                <dt className="text-muted-foreground">Contenedor</dt><dd>{f.slug}-ops</dd>
                <dt className="text-muted-foreground">Base</dt><dd>{f.slug.replace(/-/g, "_")}</dd>
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Marca del cliente</h3>
            <div className="space-y-3">
              <LogoPreview logo={f.logo} client={f.client || "Cliente"} short={f.shortName} />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-[var(--primary)] hover:text-[var(--primary)]">
                  <Upload className="size-3.5" /> Subir logo
                  <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) leerLogo(file, (uri) => set({ logo: uri })); e.target.value = ""; }} />
                </label>
                {esImagen(f.logo) && (
                  <button type="button" onClick={() => set({ logo: "" })} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-red-500 hover:text-red-500">
                    <Trash2 className="size-3.5" /> Sin logo
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Primario">
                  <input type="color" className="h-8 w-full rounded border border-border bg-background" value={/^#[0-9a-f]{6}$/i.test(f.primary) ? f.primary : "#0091D5"} onChange={(e) => set({ primary: e.target.value })} />
                </Field>
                <Field label="Acento">
                  <input type="color" className="h-8 w-full rounded border border-border bg-background" value={/^#[0-9a-f]{6}$/i.test(f.accent) ? f.accent : "#00A9E0"} onChange={(e) => set({ accent: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          <button type="button" disabled={!listo || busy} onClick={generar}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
            <PackagePlus className="size-4" /> {busy ? "Generando…" : "Generar paquete de despliegue"}
          </button>
        </section>
      </div>

      {paquete && <Resultado paquete={paquete} />}
    </div>
  );
}

function Resultado({ paquete }: { paquete: Paquete }) {
  const [abierto, setAbierto] = useState<string | null>("PROCEDIMIENTO.md");

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado");
    } catch {
      toast.error("El navegador no dejó copiar; usá Descargar.");
    }
  }

  return (
    <section className="rounded-xl border border-[var(--accent)]/40 bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Paquete de {paquete.slug}</h3>

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-4">
        <div><dt className="text-muted-foreground">URL</dt><dd>{paquete.basePath}/</dd></div>
        <div><dt className="text-muted-foreground">Contenedor</dt><dd>{paquete.container}</dd></div>
        <div><dt className="text-muted-foreground">Base</dt><dd>{paquete.db}</dd></div>
        <div><dt className="text-muted-foreground">Puerto</dt><dd>{paquete.port}</dd></div>
      </dl>

      <p className="mb-3 text-xs text-muted-foreground">
        Descargá los archivos, ponelos donde dice el procedimiento y corré <code className="font-mono text-foreground">./deploy/clone.sh</code>.
        Esta pantalla no despliega nada por sí sola: el que ejecuta es el script, en el servidor.
      </p>

      <div className="space-y-2">
        {Object.entries(paquete.files).map(([nombre, contenido]) => (
          <div key={nombre} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-2 p-2">
              <button type="button" onClick={() => setAbierto(abierto === nombre ? null : nombre)}
                className="flex-1 text-left font-mono text-xs hover:text-[var(--accent)]">
                {nombre} <span className="text-muted-foreground">· {(contenido.length / 1024).toFixed(1)} KB</span>
              </button>
              <button type="button" onClick={() => copiar(contenido)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <Copy className="size-3" /> Copiar
              </button>
              <button type="button" onClick={() => descargar(nombre, contenido)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <Download className="size-3" /> Descargar
              </button>
            </div>
            {abierto === nombre && (
              <pre className="max-h-80 overflow-auto border-t border-border bg-background p-3 font-mono text-[11px] leading-relaxed">
                {contenido.length > 20000 ? `${contenido.slice(0, 20000)}\n… (recortado para mostrar; el archivo se descarga completo)` : contenido}
              </pre>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function EquipmentForm({ draft, areas, isNew, onCancel, onSave, onChange }: {
  draft: Draft; areas: string[]; isNew: boolean; onCancel: () => void; onSave: (d: Draft) => void; onChange: (d: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="mb-4 rounded-lg border border-[var(--primary)]/40 bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{isNew ? "Nuevo equipo" : `Editar ${draft.code}`}</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Código"><input className={inputCls} value={draft.code} disabled={!isNew} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Nombre"><input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tipo"><select className={inputCls} value={draft.kind} onChange={(e) => set({ kind: e.target.value as EquipmentKind })}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <Field label="Área"><select className={inputCls} value={draft.areaCode} onChange={(e) => set({ areaCode: e.target.value })}>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        <Field label="Categoría"><input className={inputCls} value={draft.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Criticidad"><select className={inputCls} value={draft.criticality} onChange={(e) => set({ criticality: e.target.value as Draft["criticality"] })}>{CRITS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Estado"><select className={inputCls} value={draft.status} onChange={(e) => set({ status: e.target.value as Draft["status"] })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Salud %"><input type="number" className={inputCls} value={draft.health} onChange={(e) => set({ health: Number(e.target.value) })} /></Field>
        <Field label="Mímico X"><input type="number" className={inputCls} value={draft.mimic.x} onChange={(e) => set({ mimic: { ...draft.mimic, x: Number(e.target.value) } })} /></Field>
        <Field label="Mímico Y"><input type="number" className={inputCls} value={draft.mimic.y} onChange={(e) => set({ mimic: { ...draft.mimic, y: Number(e.target.value) } })} /></Field>
        <Field label="Señal (clave)"><input className={inputCls} value={draft._sigKey} onChange={(e) => set({ _sigKey: e.target.value })} /></Field>
        <Field label="Señal (etiqueta)"><input className={inputCls} value={draft._sigLabel} onChange={(e) => set({ _sigLabel: e.target.value })} /></Field>
        <Field label="Unidad"><input className={inputCls} value={draft._sigUnit} onChange={(e) => set({ _sigUnit: e.target.value })} /></Field>
        <Field label="Valor nominal"><input type="number" className={inputCls} value={draft._sigBase} onChange={(e) => set({ _sigBase: Number(e.target.value) })} /></Field>
        <Field label="Amplitud"><input type="number" className={inputCls} value={draft._sigAmp} onChange={(e) => set({ _sigAmp: Number(e.target.value) })} /></Field>
        <Field label="Ayuda (tooltip)"><input className={inputCls} value={draft.help} onChange={(e) => set({ help: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancelar</button>
        <button type="button" onClick={() => onSave(draft)} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}><Check className="size-3.5" /> Aplicar</button>
      </div>
    </div>
  );
}
