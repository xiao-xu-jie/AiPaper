# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:renderer

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8788

COPY proxy.js ./proxy.js
COPY --from=builder /app/dist ./dist

EXPOSE 8788
CMD ["node", "proxy.js"]
