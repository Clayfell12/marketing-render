# Railway deployment image.
# Uses Puppeteer's official base which ships a working Chromium and all its
# system libraries, so no manual apt install of fonts/libs is needed.

FROM ghcr.io/puppeteer/puppeteer:23.11.1

# The base image runs as non-root user "pptruser"
WORKDIR /app

# Install deps first for layer caching
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev

# App source
COPY --chown=pptruser:pptruser . .

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
# The base image sets PUPPETEER_EXECUTABLE_PATH to its bundled Chromium

EXPOSE 3000
CMD ["node", "src/server.js"]
