# Production image for the Lark DocGen API server.
#
# Build from the REPO ROOT (not server/), since this is an npm-workspaces
# monorepo and needs the root package.json/package-lock.json to resolve
# dependencies correctly:
#
#   docker build -f server/Dockerfile -t lark-docgen-server .
#
# On Render: Root Directory = repo root, Dockerfile Path = server/Dockerfile.
FROM node:20-slim

# LibreOffice (headless) powers the docx -> pdf conversion feature.
# fonts-liberation/fonts-dejavu-core give reasonable Latin + Vietnamese
# glyph coverage for generated documents.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       fonts-liberation \
       fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching): only the manifests are
# needed to resolve the full workspace dependency tree via the lockfile.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# Now bring in the server source and build it.
COPY server server
RUN npm run build --workspace server \
    && npm prune --omit=dev

ENV NODE_ENV=production
# Render injects its own PORT at runtime; 4000 is just the local default.
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
