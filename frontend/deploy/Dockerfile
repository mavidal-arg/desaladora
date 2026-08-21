# EAM Entity-360 — Next.js standalone + Prisma 7. Build context = frontend/.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_PUBLIC_BASE_PATH=/desaladora-coquimbo-v2-ops
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_PATH=/desaladora-coquimbo-v2-ops
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
