# EAM Entity-360 — Next.js standalone + Prisma 7. Build context = frontend/.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El basePath de Next se CONGELA en el build: una URL distinta exige recompilar.
# Por eso es un ARG — es lo que permite clonar la app para otro cliente sin tocar
# el código (ver deploy/clone.sh y el asistente de Administración).
ARG BASE_PATH=/desaladora-coquimbo-v2-ops
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH
# Fuente única de valores de señal + snapshot de observación. OFF por default
# (Coquimbo V2); ON en el build de Iquique (ver deploy/compose.aguas-del-norte-*).
ARG LIVE_SIGNALS_UNIFIED=0
ENV NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED=$LIVE_SIGNALS_UNIFIED
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Los ARG no cruzan de una etapa a otra: hay que volver a declararlo acá.
ARG BASE_PATH=/desaladora-coquimbo-v2-ops
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH
ARG LIVE_SIGNALS_UNIFIED=0
ENV NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED=$LIVE_SIGNALS_UNIFIED
ENV PORT=3000
# Standalone server (includes a trimmed node_modules)…
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src/generated ./src/generated
# seed.ts (run by entrypoint via tsx) importa src/lib/plant-config → incluir src/lib.
COPY --from=build /app/src/lib ./src/lib
# …then the FULL node_modules — needed by `prisma db push` + `tsx prisma/seed.ts` in entrypoint
# (Prisma 7 dropped --skip-generate from db push; do not add it).
COPY --from=build /app/node_modules ./node_modules
COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
