# wf-desal-alert-fanout — alertas de la Desaladora por Email/WhatsApp/Llamada

Recibe un `AlertEvent` (`src/lib/alert-notify.ts`) y lo reparte por canal según
nivel: **critico** → Email + WhatsApp + Llamada; **advertencia** → Email +
WhatsApp; **info** no se despacha. Mismo patrón de fan-out por severidad que
`wf-case-fanout.json` en `icsh-assistant/deploy/n8n/`.

## 0. Estado

Hoy `ALERT_WEBHOOK_URL` está vacía en
`/home/mariano/privado/secretos/desaladora-coquimbo-v2.env` — todo el código
(evaluador, despacho, UI de `/alertas`) funciona igual, sólo que cada envío
queda registrado como `delivered=false, lastError="ALERT_WEBHOOK_URL not
configured"`. Esto es intencional: se puede ensayar toda la demo (botón,
formulario de contacto, feed, pastillas de estado) sin gastar un solo mensaje
real. Los pasos de abajo son para cuando se quiera activar el envío de verdad.

## 1. Cuentas que hacen falta (ninguna existe hoy)

- **Twilio** (trial alcanza) — cubre WhatsApp (vía Sandbox) y Llamada. Un
  trial sólo manda a números *verificados* en la cuenta, lo cual además sirve
  de red de seguridad mientras se ensaya.
- **SMTP** — si ya hay un correo de la empresa (Gmail Workspace, Outlook…),
  alcanza con una contraseña de aplicación. No hace falta un proveedor nuevo.

## 2. Activar el WhatsApp Sandbox de Twilio (una sola vez, ANTES de la demo)

1. Twilio Console → Messaging → Try it out → Send a WhatsApp message.
2. Desde el celular que va a recibir las alertas, mandar el código de join
   (`join <palabra-clave>`) al número de sandbox que Twilio muestra.
3. Ese celular queda habilitado para recibir mensajes del sandbox — **si no
   se hace este paso antes, el WhatsApp de la demo no llega** y no hay forma
   de saberlo en el momento (Twilio lo acepta pero Meta lo descarta del lado
   del sandbox).

## 3. Credenciales en N8N (una vez)

### 3a. SMTP

```
N8N UI → Credentials → New → "Email Send (SMTP)"
  → host, puerto, usuario, contraseña de aplicación
  → copiar el ID del credential
```

### 3b. Twilio

```
N8N UI → Credentials → New → "Twilio API"
  → Account SID + Auth Token (Twilio Console → Account → API keys & tokens)
  → copiar el ID del credential
```

### 3c. Patchear el JSON antes de importar

`wf-desal-alert-fanout.json` trae placeholders en dos nodos — reemplazar antes
de importar (mismo criterio que `wf-case-fanout.json`, que no ata el
credential en el JSON a mano):

```bash
sed -i 's/REPLACE_CON_ID_DEL_CREDENTIAL_SMTP/<id del credential SMTP>/' wf-desal-alert-fanout.json
sed -i 's/REPLACE_CON_ID_DEL_CREDENTIAL_TWILIO/<id del credential Twilio>/g' wf-desal-alert-fanout.json
```

O simplemente reasignar el credential en cada nodo desde la UI después de
importar — es más a prueba de errores si el ID no coincide.

### 3d. Variables de entorno del propio N8N (no de este proyecto)

El workflow lee `$env.SMTP_FROM_EMAIL`, `$env.TWILIO_WHATSAPP_FROM`
(`whatsapp:+1415XXXXXXX`, el número de sandbox) y `$env.TWILIO_FROM_NUMBER`
(el número de voz de Twilio) — se agregan al `environment` del container `n8n`
en el compose de la plataforma, no acá.

## 4. Importar

```
N8N UI → Workflows → Import from File → wf-desal-alert-fanout.json
```

Queda **inactivo** (`active: false`) a propósito — activarlo desde la UI
recién cuando los tres pasos anteriores estén listos.

## 5. Configurar el webhook en la app

En `/home/mariano/privado/secretos/desaladora-coquimbo-v2.env`:

```
ALERT_WEBHOOK_URL=http://n8n:5678/webhook/desal-alert-fanout
```

(`n8n` y `desaladora-coquimbo-v2-ops` están en la misma red
`tier0_edge_network` — no hace falta salir por el borde.) Sin
`ALERT_WEBHOOK_AUTH_HEADER`: el workflow no lo valida, igual que
`wf-case-fanout` — la ruta larga hace de secreto. Después de setear la
variable, recrear el container (`docker compose up -d --force-recreate
--no-deps desaladora-coquimbo-v2-ops`) para que la tome.

## 6. Probar sin gastar los 3 canales de una

1. **Webhook → Code → Switch, sin nodos de proveedor**: en la UI de N8N,
   "Execute workflow" con un payload de prueba pineado (mismo shape que
   `buildPayload()` en `alert-notify.ts`) — confirma el ruteo por nivel a
   costo cero.
2. **Cada nodo de proveedor por separado**: "Test step" en Email, después en
   WhatsApp, después en Llamada — así ajustar el Switch no dispara los 3 de
   nuevo cada vez.
3. **Un solo end-to-end real por canal**, contra tu propio número/mail
   verificado — desde `/alertas` en la app, con el contacto apuntando a vos,
   tocar "Disparar alerta de demo" una vez por canal que se quiera confirmar.
4. Recién ahí, dejar el contacto apuntando a quien va a estar en la sala
   durante la demo real.

## Payload que manda la app

```json
{
  "alert_id": "…", "rule_id": "…", "rule_name": "CIP inminente",
  "metric": "cip_days", "level": "critico", "train_code": "A25-2",
  "message": "CIP inminente: tren A25-2 · RUL 3 días (umbral 7)",
  "threshold": 7, "op": "lt", "ts": "2026-…",
  "channels": ["email", "whatsapp", "voice"],
  "contact": { "email": "…", "phone_voice": "+56…", "phone_whatsapp": "+56…" },
  "schema_version": "1.0"
}
```
