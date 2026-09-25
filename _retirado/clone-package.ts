import type { PlantConfig } from "@/lib/plant-config";

/**
 * Armado del paquete de despliegue de un clon.
 *
 * La app NO despliega: corre en un contenedor sin acceso al Docker del host, y
 * dárselo significaría que cualquiera que entre a Administración pueda crear y
 * borrar contenedores del servidor. Entonces junta y valida todo lo que hace
 * falta, y el que ejecuta es `deploy/clone.sh` en el host.
 */

export type EntradaClon = {
  app: PlantConfig["app"];
  branding: PlantConfig["branding"];
  /** Identidad de la planta del cliente nuevo (opcional: si falta, hereda). */
  plant?: Partial<PlantConfig["plant"]>;
  port: number;
};

export type Paquete = {
  slug: string;
  basePath: string;
  container: string;
  image: string;
  db: string;
  port: number;
  files: Record<string, string>;
};

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

/** "Aguas del Valle" + "Planta Norte" → "aguas-del-valle-planta-norte" */
export function slugificar(...partes: string[]): string {
  return partes
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function validar(e: EntradaClon, slugActual: string): string | null {
  const s = e.app?.slug?.trim() ?? "";
  if (!SLUG_RE.test(s)) {
    return "El identificador debe tener entre 3 y 40 caracteres: minúsculas, números y guiones, sin empezar ni terminar con guión.";
  }
  if (s === slugActual) {
    return `«${s}» es el identificador de esta misma instancia: el clon pisaría su contenedor y su base. Elegí otro.`;
  }
  if (!e.app.name?.trim() || !e.app.client?.trim()) {
    return "El nombre de la aplicación y el del cliente son obligatorios.";
  }
  if (!Number.isInteger(e.port) || e.port < 1024 || e.port > 65535) {
    return "El puerto tiene que ser un entero entre 1024 y 65535.";
  }
  return null;
}

const cabecera = (slug: string) =>
  `# Generado por el asistente de clonado de ${slug} — ${new Date().toISOString().slice(0, 10)}`;

/**
 * `identidad.json` lleva la config VIGENTE completa con la identidad cambiada:
 * el clon nace con el catálogo que hoy tiene esta instancia (áreas, equipos,
 * señales, bandas), incluidas las ediciones hechas en Admin — no con el template
 * estático del código.
 */
export function construirPaquete(actual: PlantConfig, e: EntradaClon): Paquete {
  const slug = e.app.slug.trim();
  const basePath = `/${slug}-ops`;
  const container = `${slug}-ops`;
  const image = `${slug}-ops:latest`;
  const db = slug.replace(/-/g, "_");

  const identidad: PlantConfig = {
    ...actual,
    app: { ...e.app, slug },
    branding: { ...actual.branding, ...e.branding },
    plant: { ...actual.plant, ...(e.plant ?? {}) },
  };

  const env = [
    cabecera(slug),
    `DATABASE_URL=postgresql://USUARIO:CLAVE@HOST:5432/${db}`,
    `NEXT_PUBLIC_BASE_PATH=${basePath}`,
    `ADAPTER_MODE=sim`,
    "",
  ].join("\n");

  const compose = `${cabecera(slug)}
# Build:  docker compose -f deploy/compose.${slug}.yaml build
# Arriba: docker compose -f deploy/compose.${slug}.yaml up -d
services:
  ${container}:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
      args:
        # El basePath de Next se congela en tiempo de build: una URL distinta
        # exige recompilar. Por eso el Dockerfile lo toma como ARG.
        BASE_PATH: ${basePath}
    image: ${image}
    container_name: ${container}
    restart: unless-stopped
    env_file: ../.env.${slug}
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - NEXT_PUBLIC_BASE_PATH=${basePath}
    ports:
      - "127.0.0.1:${e.port}:3000"
    networks:
      - tier0_edge_network
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000${basePath}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 40s

networks:
  tier0_edge_network:
    external: true
`;

  const nginx = `${cabecera(slug)}
# Pegar dentro del server{} del borde y recargar con: nginx -t && nginx -s reload
# [inferencia] Contrastar con el bloque que ya sirve otra app de esta familia:
# la config del borde es de root y este asistente no puede leerla para copiarla.
location ${basePath}/ {
    proxy_pass         http://127.0.0.1:${e.port}${basePath}/;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_read_timeout 300s;
}
`;

  const procedimiento = `# Alta de ${e.app.client} — ${e.app.site}

Paquete generado el ${new Date().toISOString().slice(0, 10)} desde la Administración de
${actual.app.client} · ${actual.app.site}.

| Dato | Valor |
|---|---|
| Identificador | \`${slug}\` |
| URL | \`${basePath}/\` |
| Contenedor | \`${container}\` |
| Imagen | \`${image}\` |
| Base de datos | \`${db}\` |
| Puerto (loopback) | \`${e.port}\` |

## Antes de empezar

1. Guardá los cuatro archivos del paquete en el repo de la app:
   - \`identidad-${slug}.json\` → donde quieras (lo lee el script)
   - \`.env.${slug}\` → en \`frontend/\`, y **completá usuario, clave y host de Postgres**
   - \`compose.${slug}.yaml\` → en \`frontend/deploy/\`
   - \`nginx-${slug}.conf\` → a mano, ver el paso 4

2. El **puerto ${e.port} es una propuesta**, no una verificación: esta app corre
   dentro de un contenedor y su \`localhost\` no es el del servidor, así que no
   puede saber qué puerto está libre. El script lo verifica antes de levantar.

## Los pasos

\`\`\`bash
cd <repo>/frontend
./deploy/clone.sh identidad-${slug}.json
\`\`\`

El script hace, en este orden:

1. Verifica que el puerto ${e.port} esté libre y que no exista un contenedor \`${container}\`.
2. Crea la base \`${db}\` en el Postgres de Tier0.
3. \`docker compose -f deploy/compose.${slug}.yaml build\` — recompila con \`BASE_PATH=${basePath}\`.
4. \`up -d\` y espera el healthcheck. El entrypoint corre \`prisma db push\` y el seed solo.
5. **Recién entonces** inserta la identidad en la base del clon.

> Ese orden importa: la identidad se escribe DESPUÉS del seed y con la misma
> \`version\` del template, así el seed de los arranques siguientes no la pisa
> (\`prisma/seed.ts\` re-siembra sólo si \`storedVersion < PLANT.version\`).

## 4. El borde (manual)

Pegá el contenido de \`nginx-${slug}.conf\` en la config del borde y recargá:

\`\`\`bash
sudo nginx -t && sudo nginx -s reload
\`\`\`

Queda manual a propósito: el borde es compartido con todo Tier0 y su archivo es
de root — no es algo para automatizar desde una app web.

## 5. Verificación

- \`docker ps\` muestra \`${container}\` en \`healthy\`.
- \`https://<dominio>${basePath}/\` responde y muestra la identidad de ${e.app.client}.
- \`docker restart ${container}\` y la identidad **sigue estando** (la trampa del seed).
`;

  return {
    slug,
    basePath,
    container,
    image,
    db,
    port: e.port,
    files: {
      [`identidad-${slug}.json`]: JSON.stringify(identidad, null, 2),
      [`.env.${slug}`]: env,
      [`compose.${slug}.yaml`]: compose,
      [`nginx-${slug}.conf`]: nginx,
      "PROCEDIMIENTO.md": procedimiento,
    },
  };
}
