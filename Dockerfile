# Runs Clutch on any container host. Mount a volume at /data so profiles,
# coins and picks survive restarts.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_FILE=/data/db.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
