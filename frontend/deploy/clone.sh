#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Alta de un cliente nuevo a partir del paquete que genera el asistente de
# Administración (pestaña «Duplicar para un cliente»).
#
#   cd <repo>/frontend && ./deploy/clone.sh identidad-<slug>.json
#
# La app NO despliega por sí sola: corre en un contenedor sin acceso al Docker
# del host, y dárselo significaría que esa pantalla pudiera crear y borrar
# contenedores del servidor. Este script es el que ejecuta.
#
# El paso de nginx queda MANUAL a propósito: el borde es compartido con todo
# Tier0 y su config es de root.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

die() { echo "✗ $*" >&2; exit 1; }
paso() { echo; echo "── $* ──"; }

[ $# -ge 1 ] || die "Uso: $0 identidad-<slug>.json [--si]"
JSON="$1"
AUTO="${2:-}"
[ -f "$JSON" ] || die "No existe el archivo $JSON"

command -v jq     >/dev/null || die "Falta jq"
command -v docker >/dev/null || die "Falta docker"

cd "$(dirname "$0")/.."          # → frontend/

SLUG="$(jq -r '.app.slug // empty' "$JSON")"
CLIENTE="$(jq -r '.app.client // "?"' "$JSON")"
[ -n "$SLUG" ] || die "El JSON no trae .app.slug"
echo "$SLUG" | grep -qE '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' \
  || die "Identificador inválido: $SLUG"

BASE_PATH="/${SLUG}-ops"
CONTAINER="${SLUG}-ops"
DB="${SLUG//-/_}"
COMPOSE="deploy/compose.${SLUG}.yaml"
ENVFILE=".env.${SLUG}"

[ -f "$COMPOSE" ] || die "Falta $COMPOSE (bajalo del asistente y ponelo ahí)"
[ -f "$ENVFILE" ] || die "Falta $ENVFILE (bajalo del asistente, completá usuario/clave de Postgres)"

PORT="$(grep -oE '127\.0\.0\.1:[0-9]+' "$COMPOSE" | head -1 | cut -d: -f2)"
[ -n "$PORT" ] || die "No pude leer el puerto de $COMPOSE"

# El contenedor de Postgres de Tier0 y el usuario salen del .env de ESTA app.
PGC="${PGC:-postgresql}"
PGUSER="$(grep -oE 'postgresql://[^:]+' .env | head -1 | cut -d/ -f3)"
[ -n "$PGUSER" ] || die "No pude leer el usuario de Postgres de ./.env"

cat <<RESUMEN

  Cliente     : $CLIENTE
  Identificador: $SLUG
  URL         : $BASE_PATH/
  Contenedor  : $CONTAINER
  Base        : $DB   (en el contenedor «$PGC», usuario «$PGUSER»)
  Puerto      : 127.0.0.1:$PORT

RESUMEN

if [ "$AUTO" != "--si" ]; then
  read -r -p "¿Damos de alta este cliente? [s/N] " ok
  case "$ok" in s|S|si|SI|Si) ;; *) die "Cancelado." ;; esac
fi

paso "1/5 · Verificaciones"
docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER" \
  && die "Ya existe un contenedor llamado $CONTAINER"
ss -ltn 2>/dev/null | grep -qE "[:.]${PORT}\b" \
  && die "El puerto $PORT ya está ocupado en el host. Elegí otro y regenerá el paquete."
docker network inspect tier0_edge_network >/dev/null 2>&1 \
  || die "No existe la red tier0_edge_network"
echo "✓ nombre, puerto y red disponibles"

paso "2/5 · Base de datos $DB"
# CREATE DATABASE lo hace el superusuario y deja al usuario de la app como
# DUEÑO: `misa_engine` no tiene CREATEDB (verificado en el cluster de Tier0), y
# sin OWNER el `prisma db push` del entrypoint no podría crear las tablas.
PGSUPER="${PGSUPER:-postgres}"
if docker exec "$PGC" psql -U "$PGSUPER" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  echo "· ya existía, se reutiliza"
else
  docker exec "$PGC" psql -U "$PGSUPER" -d postgres \
    -c "CREATE DATABASE \"$DB\" OWNER \"$PGUSER\"" >/dev/null \
    || die "No pude crear la base como «$PGSUPER». Pedí que la creen a mano:
       CREATE DATABASE \"$DB\" OWNER \"$PGUSER\";
     y volvé a correr el script (detecta que ya existe y sigue)."
  echo "✓ creada, dueño $PGUSER"
fi

paso "3/5 · Imagen (recompila con BASE_PATH=$BASE_PATH)"
docker compose -f "$COMPOSE" build

paso "4/5 · Contenedor"
docker compose -f "$COMPOSE" up -d
echo -n "esperando el healthcheck"
for i in $(seq 1 60); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo starting)"
  [ "$estado" = "healthy" ] && break
  [ "$estado" = "unhealthy" ] && { echo; docker logs --tail 40 "$CONTAINER"; die "El contenedor quedó unhealthy"; }
  echo -n "."
  sleep 5
done
echo
[ "${estado:-}" = "healthy" ] || die "No llegó a healthy. Revisá: docker logs $CONTAINER"
echo "✓ $CONTAINER healthy"

paso "5/5 · Identidad del cliente"
# DESPUÉS del arranque a propósito: el entrypoint corre `prisma db push` y el
# seed, así que antes no existe ni la tabla. Y como la identidad se guarda con la
# MISMA `version` del template, el seed de los arranques siguientes no la pisa
# (prisma/seed.ts re-siembra sólo si storedVersion < PLANT.version).
docker exec -i "$PGC" psql -U "$PGUSER" -d "$DB" -q <<SQL
INSERT INTO "PlantConfig" (id, data, "createdAt", "updatedAt")
VALUES ('singleton', \$sia\$$(cat "$JSON")\$sia\$::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now();
SQL
echo "✓ identidad de $CLIENTE aplicada"

cat <<FIN

════════════════════════════════════════════════════════════════
  $CLIENTE está arriba en 127.0.0.1:$PORT

  FALTA UN PASO, y es manual: publicar la URL en el borde.
    1. Pegá deploy/nginx-${SLUG}.conf dentro del server{} del nginx del borde
    2. sudo nginx -t && sudo nginx -s reload

  Después, verificá:
    curl -sI http://127.0.0.1:$PORT$BASE_PATH/api/health
    docker restart $CONTAINER   # la identidad tiene que sobrevivir
════════════════════════════════════════════════════════════════
FIN
