# syntax=docker/dockerfile:1.7

FROM node:22.12.0-alpine3.20 AS builder
WORKDIR /project

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.12.0-alpine3.20 AS runtime
WORKDIR /project

ENV NODE_ENV=production
ENV APP_ENV=prod

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /project/dist ./dist
COPY src/public ./public

EXPOSE 8080
CMD ["node", "dist/app.js"]
