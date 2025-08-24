# syntax=docker/dockerfile:1

# Build stage with full toolchain to compile native modules (e.g., better-sqlite3)
FROM node:20-bullseye AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Install build tools for native modules (only in build stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm ci --omit=dev

# Runtime stage: slim image with only production deps and app code
FROM node:20-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm","start"]