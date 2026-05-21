FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 axon && adduser -D -u 1001 -G axon axon

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

USER axon
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "server.js"]
