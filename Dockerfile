# Builds the React client and runs the Express API, which also serves the client.
# Hugging Face Spaces sends traffic to port 7860.
FROM node:20-slim

WORKDIR /app

# Install dependencies first so Docker can cache this layer
COPY client/package.json client/package-lock.json client/
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix client && npm ci --omit=dev --prefix server

# Build the client
COPY client client
RUN npm run build --prefix client

# Copy the server
COPY server server

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

# The "node" user has uid 1000, which Hugging Face Spaces expects
USER node
CMD ["node", "server/src/server.js"]
