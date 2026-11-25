FROM node:24-slim AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY dev ./dev
RUN npm run build

# --- Runtime ---
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/src ./dist/src

EXPOSE 443

CMD ["node", "dist/src/bootstrap.js"]
