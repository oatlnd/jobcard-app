# Single image for API + worker (+ built React app). Used by docker-compose.yml / Coolify.
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production SERVE_CLIENT=true
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
RUN mkdir -p /app/uploads && chown node:node /app/uploads
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
