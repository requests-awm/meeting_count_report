# Ascot Meeting Report — container image
# Default = SERVICE mode (serves the dashboard + scheduled refresh).
# Override CMD for JOB mode:  node src/index.js --start 2025-07-01 --end 2026-07-01
FROM node:20-alpine

# Small init so signals (SIGTERM) are handled cleanly on shutdown.
RUN apk add --no-cache tini

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

# Install production deps only (sharp lives in devDependencies and is not needed
# at runtime — the favicon is a pre-built asset).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# App source + config + pre-built brand assets. Secrets (.env) are NOT copied;
# they are provided at runtime via environment variables.
COPY src ./src
COPY config.json ./
COPY assets ./assets

# Run as the non-root user the node image provides. The app writes results.*
# and out/report.html into /app at runtime, so it must own the app dir.
RUN mkdir -p /app/out && chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
