# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Copy installed modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy all application files
COPY . .

# Expose the port Railway will use
EXPOSE 3000

# Start the Express server
CMD ["node", "server.js"]
