FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    p7zip-full \
    unzip \
    libarchive-tools \
    tar \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
