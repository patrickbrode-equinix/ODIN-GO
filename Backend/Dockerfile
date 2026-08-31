# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel error

# Copy source
COPY . .

# Expose backend port
EXPOSE 8001

CMD ["node", "server.js"]
