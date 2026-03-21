ARG SERVICE_NAME=processing-service
ARG PORT=3003
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force

FROM deps AS builder
# Install OpenSSL required by Prisma
RUN apk add --no-cache openssl
COPY . .
RUN npx prisma generate --schema=libs/database/prisma/schema.prisma
RUN npx nx build database --prod
RUN npx nx build shared-types --prod
RUN npx nx build shared-monitoring --prod
ARG SERVICE_NAME
RUN npx nx build ${SERVICE_NAME} --prod

FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini wget openssl \
  && addgroup -S appgroup \
  && adduser -S appuser -G appgroup

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.production.json ./tsconfig.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy Prisma CLI for migrations
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Copy Prisma schema file for migrations
COPY --from=builder /app/libs/database/prisma ./libs/database/prisma
# Copy startup script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
# Set proper permissions for appuser
RUN mkdir -p /app/node_modules/@prisma/engines \
  && chown -R appuser:appgroup /app \
  && chmod +x /app/docker-entrypoint.sh

ARG SERVICE_NAME
ARG PORT
ENV NODE_ENV=production \
    SERVICE_NAME=${SERVICE_NAME} \
    PORT=${PORT}

USER appuser
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
