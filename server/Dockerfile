# Scanner API container (Render / Fly.io / Railway / any VPS).
# Build from the repo root:  docker build -f server/Dockerfile -t stackscout-api .
# The Playwright image already contains Chromium and its system libraries.
FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false

COPY shared shared
COPY server server
RUN npm run build -w server

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "server/dist/server/src/index.js"]
