ARG SERVICE_NAME=api-gateway
ARG PORT=3000
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force

FROM deps AS builder
COPY . .
RUN npx prisma generate --schema=libs/database/prisma/schema.prisma
RUN npx nx build database --prod
RUN npx nx build shared-types --prod
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
CMD ["sh", "-c", "node -r tsconfig-paths/register dist/apps/${SERVICE_NAME}/src/main.js"]
