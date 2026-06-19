# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

# Production stage
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.agents ./.agents
COPY --from=builder /app/.env.example ./.env

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3080
ENV NODE_ENV=production
ENV PORT=3080

CMD ["node", "dist/main"]
