FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 make g++ \
  && npm ci \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    ONEVIBE_API_HOST=0.0.0.0 \
    ONEVIBE_API_PORT=4311 \
    ONEVIBE_DATA_DIR=/var/lib/onevibe

RUN groupadd --system --gid 10001 onevibe \
  && useradd --system --uid 10001 --gid onevibe --home-dir /nonexistent --shell /usr/sbin/nologin onevibe \
  && mkdir -p /app /var/lib/onevibe \
  && chown -R onevibe:onevibe /app /var/lib/onevibe

WORKDIR /app
COPY --from=dependencies --chown=onevibe:onevibe /app/node_modules ./node_modules
COPY --from=builder --chown=onevibe:onevibe /app/dist ./dist
COPY --from=builder --chown=onevibe:onevibe /app/server ./server
COPY --from=builder --chown=onevibe:onevibe /app/src ./src
COPY --from=builder --chown=onevibe:onevibe /app/package.json ./package.json

USER onevibe
EXPOSE 4311
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4311/api/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--import=tsx/esm", "server/index.ts"]
