# =============================================================
# apps/upload-service/Dockerfile
# Multi-stage build — identical pattern to auth-service
# Only the target name changes: upload-service
# =============================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate --schema=libs/database/prisma/schema.prisma
RUN npx nx build database --prod
RUN npx nx build shared-types --prod
RUN npx nx build upload-service --prod

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --frozen-lockfile

FROM node:20-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.production.json ./tsconfig.json
COPY --from=prod-deps /app/node_modules ./node_modules

USER appuser

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3002/api/v1/health || exit 1

ENV NODE_ENV=production
ENV PORT=3002
ENV SERVICE_NAME=upload-service

CMD ["node", "-r", "tsconfig-paths/register", "dist/apps/upload-service/apps/upload-service/src/main.js"]
