# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared package first
COPY packages/shared/package.json packages/shared/package-lock.json* ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Install and build shared
WORKDIR /app/packages/shared
RUN npm install && npm run build

# Copy service package files
WORKDIR /app/services/price-aggregator
COPY services/price-aggregator/package.json services/price-aggregator/package-lock.json* ./
RUN npm install

# Copy source and build
COPY services/price-aggregator/src ./src
COPY services/price-aggregator/tsconfig.json ./
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy shared built output
COPY --from=builder /app/packages/shared ./packages/shared

# Copy service built output and production deps
COPY --from=builder /app/services/price-aggregator/dist ./dist
COPY --from=builder /app/services/price-aggregator/node_modules ./node_modules
COPY --from=builder /app/services/price-aggregator/package.json ./
RUN mkdir -p node_modules/@neuralgrid && ln -sf /app/packages/shared node_modules/@neuralgrid/shared

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8003/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
