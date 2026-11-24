FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json frontend/tailwind.config.js frontend/postcss.config.js ./
COPY frontend/src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
