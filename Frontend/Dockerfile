# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app

# Vite bakes import.meta.env.* at BUILD TIME.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel error

COPY . .
RUN npm run build

# Serve with express + proxy to backend
FROM node:20-alpine AS runner
WORKDIR /app

# Copy pinned server-package.json for reproducible installs (no npm init -y)
COPY server-package.json package.json
RUN npm install --omit=dev --no-audit --no-fund --loglevel error

COPY --from=builder /app/dist ./dist
COPY server.js ./server.js

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/healthz || exit 1

CMD ["node", "server.js"]
