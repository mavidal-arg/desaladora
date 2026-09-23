"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiUrl, cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { AlertLevelBadge } from "@/components/AlertLevelBadge";
import { TabBar } from "@/components/TabBar";
import { ALERT_METRIC_LABELS, RO_TRAINS } from "@/lib/oee-types";
import type { AlertRow, AlertRuleRow } from "@/lib/oee";
import type { AlertNotificationRow } from "@/lib/alert-notify";
import type { AlertChannelRuleRow } from "@/lib/alert-channels";
import type { AlertRecipientRow, SubscriptionPair } from "@/lib/alert-recipients";
import { useAlertPoll } from "@/lib/useAlertPoll";

const dt = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const CHANNEL_LABEL: Record<string, string> = { inapp: "En la app", email: "Email", whatsapp: "WhatsApp", voice: "Llamada" };
// Política severidad→canal: incluye in-app. Las suscripciones de destinatarios
// NO, porque in-app es broadcast y no se suscribe nadie (ver SUBSCRIBABLE).
const CHANNELS = ["inapp", "email", "whatsapp", "voice"] as const;
const SUBSCRIBABLE = ["email", "whatsapp", "voice"] as const;
const LEVELS = ["critico", "advertencia", "info"] as const;
const LEVEL_LABEL: Record<string, string> = { critico: "Crítico", advertencia: "Advertencia", info: "Info" };
const OPS = ["lt", "gt"] as const;
// Espejo de UF_CODES en src/lib/uf.ts — no se importa directo porque ese
// módulo arrastra `prisma`/`pg` al bundle del cliente (solo debe usarse
// server-side).
const UF_CODES = ["A12-1", "A12-2", "A12-3"] as const;

function ChannelPill({ channel, notif }: { channel: string; notif: AlertNotificationRow | undefined }) {
  const label = CHANNEL_LABEL[channel] ?? channel;
  if (!notif) {
    return <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{label} · no aplica</span>;
  }
  // in-app no se "envía": la fila ES la entrega, se ve en la burbuja del Shell.
  if (channel === "inapp") {
    return <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">{label} · visible</span>;
  }
  const ok = notif.delivered;
  return (
    <span
      title={notif.lastError ?? undefined}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        ok ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600",
      )}
    >
      {label} · {ok ? "enviado" : "falló"}
    </span>
  );
}

function inputCls() {
  return "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";
}

async function send<T = unknown>(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(apiUrl(path), {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error((data as { error?: string }).error ?? "No se pudo completar la acción"); return { ok: false, data: null }; }
    return { ok: true, data: data as T };
  } catch { toast.error("Error de red"); return { ok: false, data: null }; }
}

export function AlertasPageClient({ role, alerts, rules, channelRules, recipients, notifications }: {
  role: string;
  alerts: AlertRow[];
  rules: AlertRuleRow[];
  channelRules: AlertChannelRuleRow[];
  recipients: AlertRecipientRow[];
  notifications: AlertNotificationRow[];
}) {
  const [tab, setTab] = useState("Feed");
  const [alertRows, setAlertRows] = useState(alerts);
  const [notifRows, setNotifRows] = useState(notifications);
  const [ruleRows, setRuleRows] = useState(rules);
  const [channelRows, setChannelRows] = useState(channelRules);
  const [recipientRows, setRecipientRows] = useState(recipients);
  const [firing, setFiring] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRuleRow | "new" | null>(null);
  const [editingRecipient, setEditingRecipient] = useState<AlertRecipientRow | "new" | null>(null);

  const canManage = can(role, "manage_alert_rules");
  const canAck = can(role, "ack_alert");

  const notifByEvent = useMemo(() => {
    const m = new Map<string, Map<string, AlertNotificationRow>>();
    for (const n of notifRows) {
      if (!m.has(n.alertEventId)) m.set(n.alertEventId, new Map());
      const forEvent = m.get(n.alertEventId)!;
      if (!forEvent.has(n.channel)) forEvent.set(n.channel, n);
    }
    return m;
  }, [notifRows]);

  const refetchAll = async () => {
    const [a, n] = await Promise.all([
      fetch(apiUrl("/api/oee/alerts")).then((r) => (r.ok ? r.json() : alertRows)),
      fetch(apiUrl("/api/twin/notifications")).then((r) => (r.ok ? r.json() : notifRows)),
    ]);
    setAlertRows(a);
    setNotifRows(n);
  };

  useAlertPoll((count) => {
    toast.info(count === 1 ? "Nueva alerta detectada" : `${count} alertas nuevas detectadas`);
    void refetchAll();
  });

  const fireDemo = async () => {
    setFiring(true);
    try {
      const res = await fetch(apiUrl("/api/twin/evaluate-alerts"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "demo" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo disparar la alerta"); return; }
      const created = Array.isArray(data.created) ? data.created.length : 0;
      if (created === 0) {
        toast.warning("Ya hay una alerta activa para esa regla — resolvela para volver a dispararla.");
      } else {
        toast.success("Alerta disparada — revisá los canales abajo.");
      }
      await refetchAll();
    } finally {
      setFiring(false);
    }
  };

  const ack = async (id: string) => { if ((await send("/api/oee/alerts", "PATCH", { id, action: "ack" })).ok) { toast.success("Alerta reconocida"); await refetchAll(); } };
  const resolve = async (id: string) => {
    const a = prompt("Acción tomada (opcional):") ?? undefined;
    if ((await send("/api/oee/alerts", "PATCH", { id, action: "resolve", actionTaken: a })).ok) { toast.success("Alerta resuelta"); await refetchAll(); }
  };

  const toggleChannel = async (level: string, channel: string, enabled: boolean) => {
    const { ok, data } = await send<AlertChannelRuleRow>("/api/oee/alert-channels", "PATCH", { level, channel, enabled });
    if (ok && data) setChannelRows((rows) => rows.map((r) => (r.level === level ? data : r)));
  };

  const deleteRule = async (id: string) => {
    if (!confirm("¿Borrar esta regla de alerta?")) return;
    if ((await send(`/api/oee/alert-rules?id=${id}`, "DELETE")).ok) {
      setRuleRows((rows) => rows.filter((r) => r.id !== id));
      toast.success("Regla eliminada");
    }
  };

  const saveRule = async (rule: AlertRuleRow) => {
    const { ok, data } = await send<AlertRuleRow>("/api/oee/alert-rules", "POST", rule);
    if (!ok || !data) return false;
    setRuleRows((rows) => (rows.some((r) => r.id === data.id) ? rows.map((r) => (r.id === data.id ? data : r)) : [...rows, data]));
    setEditingRule(null);
    toast.success("Regla guardada");
    return true;
  };

  const deactivateRecipient = async (id: string) => {
    if (!confirm("¿Quitar este destinatario de la lista de distribución?")) return;
    if ((await send(`/api/oee/alert-recipients?id=${id}`, "DELETE")).ok) {
      setRecipientRows((rows) => rows.map((r) => (r.id === id ? { ...r, active: false } : r)));
      toast.success("Destinatario desactivado");
    }
  };

  const saveRecipient = async (isNew: boolean, body: unknown) => {
    const { ok, data } = await send<AlertRecipientRow>("/api/oee/alert-recipients", isNew ? "POST" : "PATCH", body);
    if (!ok || !data) return false;
    setRecipientRows((rows) => (rows.some((r) => r.id === data.id) ? rows.map((r) => (r.id === data.id ? data : r)) : [...rows, data]));
    setEditingRecipient(null);
    toast.success("Destinatario guardado");
    return true;
  };

  const statusLbl: Record<string, string> = { activa: "Activa", reconocida: "Reconocida", resuelta: "Resuelta" };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <TabBar tabs={["Feed", "Reglas", "Severidad → Canales", "Destinatarios"]} active={tab} onChange={setTab} />

      {tab === "Feed" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold">Disparar alerta de demo</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fuerza el RUL de CIP del tren A25-2 a 3 días (umbral 7) y despacha por los canales
                configurados en &quot;Severidad → Canales&quot; a los destinatarios suscriptos.
              </p>
            </div>
            {canManage ? (
              <button onClick={fireDemo} disabled={firing}
                className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white disabled:opacity-60">
                {firing ? "Disparando…" : "⚡ Disparar alerta de demo"}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">Solo Supervisor/Planificador puede disparar la demo.</span>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Alertas <span className="text-muted-foreground">({alertRows.length})</span></h2>
            {alertRows.map((a) => {
              const forEvent = notifByEvent.get(a.id);
              return (
                <div key={a.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertLevelBadge level={a.level} />
                      <span className="text-sm">{a.message}</span>
                    </div>
                    <span className={cn("shrink-0 text-[11px]", a.status === "activa" ? "text-red-600" : a.status === "reconocida" ? "text-amber-600" : "text-green-600")}>
                      {statusLbl[a.status]}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{dt(a.ts)}</span>
                    {a.trainCode && <span className="font-mono">{a.trainCode}</span>}
                    {a.ackBy && <span>Rec.: {a.ackBy}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CHANNELS.map((c) => <ChannelPill key={c} channel={c} notif={forEvent?.get(c)} />)}
                  </div>
                  {canAck && a.status !== "resuelta" && (
                    <div className="mt-2 flex gap-2">
                      {a.status === "activa" && <button onClick={() => ack(a.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Reconocer</button>}
                      <button onClick={() => resolve(a.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Resolver</button>
                    </div>
                  )}
                </div>
              );
            })}
            {alertRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin alertas todavía.</p>}
          </div>
        </div>
      )}

      {tab === "Reglas" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Reglas de alerta <span className="text-muted-foreground">({ruleRows.length})</span></h2>
            {canManage && (
              <button onClick={() => setEditingRule("new")} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">
                + Nueva regla
              </button>
            )}
          </div>
          {ruleRows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  <AlertLevelBadge level={r.level} />
                  {!r.enabled && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">deshabilitada</span>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditingRule(r)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Editar</button>
                    <button onClick={() => deleteRule(r.id)} className="rounded border border-border px-2 py-1 text-xs text-red-600 hover:bg-muted">Borrar</button>
                  </div>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {ALERT_METRIC_LABELS[r.metric] ?? r.metric} {r.op === "lt" ? "<" : ">"} {r.threshold}
                {r.trainCode ? ` · ${r.trainCode}` : " · todos"}
              </div>
            </div>
          ))}
          {ruleRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin reglas todavía.</p>}
        </div>
      )}

      {tab === "Severidad → Canales" && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Canal de notificación según severidad</h2>
          <p className="text-[11px] text-muted-foreground">
            Qué canales se disparan para cada nivel. Un canal apagado acá nunca se despacha, aunque
            haya destinatarios suscriptos.
          </p>
          <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="p-3">Severidad</th>
                {CHANNELS.map((c) => <th key={c} className="p-3 text-center">{CHANNEL_LABEL[c]}</th>)}
              </tr>
            </thead>
            <tbody>
              {channelRows.map((row) => (
                <tr key={row.level} className="border-b border-border last:border-0">
                  <td className="p-3"><AlertLevelBadge level={row.level} /></td>
                  {CHANNELS.map((c) => (
                    <td key={c} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={row[c]}
                        disabled={!canManage}
                        onChange={(e) => toggleChannel(row.level, c, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Destinatarios" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Lista de distribución <span className="text-muted-foreground">({recipientRows.filter((r) => r.active).length} activos)</span></h2>
            {canManage && (
              <button onClick={() => setEditingRecipient("new")} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">
                + Nuevo destinatario
              </button>
            )}
          </div>
          {recipientRows.map((r) => (
            <div key={r.id} className={cn("rounded-lg border border-border bg-card p-3", !r.active && "opacity-50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.name}{!r.active && " (inactivo)"}</span>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditingRecipient(r)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Editar</button>
                    {r.active && <button onClick={() => deactivateRecipient(r.id)} className="rounded border border-border px-2 py-1 text-xs text-red-600 hover:bg-muted">Quitar</button>}
                  </div>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {r.email && <span>✉ {r.email}</span>}
                {r.phoneWhatsapp && <span>WhatsApp {r.phoneWhatsapp}</span>}
                {r.phoneVoice && <span>☎ {r.phoneVoice}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.subscriptions.length === 0 && <span className="text-[11px] text-muted-foreground">Sin suscripciones</span>}
                {r.subscriptions.map((s) => (
                  <span key={`${s.level}-${s.channel}`} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {LEVEL_LABEL[s.level] ?? s.level} · {CHANNEL_LABEL[s.channel] ?? s.channel}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {recipientRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin destinatarios todavía.</p>}
        </div>
      )}

      {editingRule && (
        <RuleEditModal
          rule={editingRule === "new" ? null : editingRule}
          onClose={() => setEditingRule(null)}
          onSave={saveRule}
        />
      )}
      {editingRecipient && (
        <RecipientEditModal
          recipient={editingRecipient === "new" ? null : editingRecipient}
          onClose={() => setEditingRecipient(null)}
          onSave={saveRecipient}
        />
      )}
    </div>
  );
}

// ── Modal: alta/edición de regla ──────────────────────────────────────────

function RuleEditModal({ rule, onClose, onSave }: {
  rule: AlertRuleRow | null;
  onClose: () => void;
  onSave: (rule: AlertRuleRow) => Promise<boolean>;
}) {
  const [form, setForm] = useState<AlertRuleRow>(
    rule ?? { id: "", name: "", metric: "oee", op: "lt", threshold: 0, level: "advertencia", enabled: true, trainCode: null },
  );
  const [saving, setSaving] = useState(false);
  const trainOptions = form.metric === "ceb_hours" ? UF_CODES : RO_TRAINS;

  const save = async () => {
    if (!form.name.trim()) { toast.error("Falta el nombre"); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mt-4 w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold">{rule ? "Editar regla" : "Nueva regla de alerta"}</h3>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Nombre
            <input className={inputCls()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Variable
              <select className={inputCls()} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value, trainCode: null })}>
                {Object.entries(ALERT_METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Severidad
              <select className={inputCls()} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Operador
              <select className={inputCls()} value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}>
                {OPS.map((o) => <option key={o} value={o}>{o === "lt" ? "menor que (<)" : "mayor que (>)"}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Umbral
              <input type="number" className={inputCls()} value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Tren (opcional — vacío = todos)
            <select className={inputCls()} value={form.trainCode ?? ""} onChange={(e) => setForm({ ...form, trainCode: e.target.value || null })}>
              <option value="">Todos</option>
              {trainOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Habilitada
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: alta/edición de destinatario ───────────────────────────────────

function RecipientEditModal({ recipient, onClose, onSave }: {
  recipient: AlertRecipientRow | null;
  onClose: () => void;
  onSave: (isNew: boolean, body: unknown) => Promise<boolean>;
}) {
  const [name, setName] = useState(recipient?.name ?? "");
  const [email, setEmail] = useState(recipient?.email ?? "");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(recipient?.phoneWhatsapp ?? "");
  const [phoneVoice, setPhoneVoice] = useState(recipient?.phoneVoice ?? "");
  const [active, setActive] = useState(recipient?.active ?? true);
  const [subs, setSubs] = useState<Set<string>>(new Set((recipient?.subscriptions ?? []).map((s) => `${s.level}:${s.channel}`)));
  const [saving, setSaving] = useState(false);

  const toggleSub = (level: string, channel: string) => {
    const key = `${level}:${channel}`;
    setSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Falta el nombre"); return; }
    const subscriptions: SubscriptionPair[] = [...subs].map((k) => {
      const [level, channel] = k.split(":");
      return { level, channel };
    });
    setSaving(true);
    try {
      await onSave(!recipient, {
        id: recipient?.id, name, email, phoneWhatsapp, phoneVoice, active, subscriptions,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mt-4 w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold">{recipient ? "Editar destinatario" : "Nuevo destinatario"}</h3>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Nombre
            <input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Email
            <input className={inputCls()} type="email" placeholder="nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Teléfono WhatsApp (E.164)
            <input className={inputCls()} placeholder="+56912345678" value={phoneWhatsapp} onChange={(e) => setPhoneWhatsapp(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Teléfono llamada (E.164)
            <input className={inputCls()} placeholder="+56912345678" value={phoneVoice} onChange={(e) => setPhoneVoice(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Activo
          </label>

          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Se suscribe a</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="text-left font-normal"></th>
                  {SUBSCRIBABLE.map((c) => <th key={c} className="font-normal">{CHANNEL_LABEL[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((l) => (
                  <tr key={l}>
                    <td className="py-1 text-left"><AlertLevelBadge level={l} /></td>
                    {SUBSCRIBABLE.map((c) => (
                      <td key={c} className="text-center">
                        <input type="checkbox" checked={subs.has(`${l}:${c}`)} onChange={() => toggleSub(l, c)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
