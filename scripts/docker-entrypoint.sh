#!/bin/sh
set -e

echo "� Checking Prisma setup..."
echo "Current directory: $(pwd)"
echo "Prisma schema exists: $(test -f libs/database/prisma/schema.prisma && echo 'YES' || echo 'NO')"
echo "Migrations directory: $(test -d libs/database/prisma/migrations && echo 'YES' || echo 'NO')"

if [ -d "libs/database/prisma/migrations" ]; then
  echo "📁 Migrations found: $(ls -la libs/database/prisma/migrations | wc -l) items"
  ls -la libs/database/prisma/migrations
fi

echo ""
echo "🔄 Running database migrations..."
if npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma; then
    echo "✅ Migrations completed successfully"
else
    echo "⚠️  Migration command exited with code $?"
    echo "   This might be OK if there are no pending migrations"
fi

echo ""
echo "✅ Starting application: $SERVICE_NAME on port $PORT"
exec node "dist/apps/${SERVICE_NAME}/src/main.js"
