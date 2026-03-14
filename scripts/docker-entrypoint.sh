#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma || {
    echo "⚠️  Migration failed or no migrations to apply"
}

echo "✅ Starting application: $SERVICE_NAME on port $PORT"
exec node -r tsconfig-paths/register "dist/apps/${SERVICE_NAME}/src/main.js"
