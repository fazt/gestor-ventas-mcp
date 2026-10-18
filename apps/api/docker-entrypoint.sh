#!/bin/sh
set -e

# 1) Migraciones pendientes (drizzle-kit está en las dependencias de producción de @gestor/db).
echo "Aplicando migraciones..."
(cd /app/packages/db && ./node_modules/.bin/drizzle-kit migrate)

# 2) Datos de demo opcionales (idempotente: no duplica ni borra nada).
if [ "$SEED_ON_START" = "true" ]; then
  echo "SEED_ON_START=true: cargando datos de demo..."
  (cd /app/packages/db && ./node_modules/.bin/tsx src/seed.ts)
fi

# 3) exec: node pasa a ser PID 1 y recibe SIGTERM para el apagado ordenado.
exec ./node_modules/.bin/tsx src/server.ts
