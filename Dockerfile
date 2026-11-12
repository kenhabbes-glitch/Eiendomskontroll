# Eiendomskontroll på egen server (se server/README.md)
FROM node:22-alpine AS bygg
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build && node server/bygg.mjs && mkdir -p dist/epostmaler && cp supabase/epostmaler/*.html dist/epostmaler/

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tzdata
ENV NODE_ENV=production TZ=Europe/Oslo PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=bygg /app/dist ./dist
COPY --from=bygg /app/server ./server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/helse || exit 1
CMD ["node", "server/server.mjs"]
