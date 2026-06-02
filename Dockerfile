# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY vendor/bridge-sdk/package.json vendor/bridge-sdk/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_BRIDGE_NETWORK
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BASE_RPC_URL
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
ARG NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL

ENV NEXT_PUBLIC_BRIDGE_NETWORK=${NEXT_PUBLIC_BRIDGE_NETWORK}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_BASE_RPC_URL=${NEXT_PUBLIC_BASE_RPC_URL}
ENV NEXT_PUBLIC_SOLANA_RPC_URL=${NEXT_PUBLIC_SOLANA_RPC_URL}
ENV NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=${NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL}
ENV NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL=${NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm --prefix vendor/bridge-sdk run build
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/docs ./docs
COPY --from=builder --chown=nextjs:nodejs /app/SKILL.md ./SKILL.md

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
