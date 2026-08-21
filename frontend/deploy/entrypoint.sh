#!/bin/sh
set -e
# Idempotent schema sync + seed on every start (DB `desaladora_coquimbo` must already exist).
npx prisma db push --accept-data-loss
npx prisma db seed
exec node server.js
