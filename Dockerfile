# PackWise production image — Node 24 provides the built-in node:sqlite module.
FROM node:24-slim
WORKDIR /app
ENV NODE_OPTIONS=--no-warnings
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    PACKWISE_DATA_DIR=/data \
    PACKWISE_UPLOAD_DIR=/data/uploads
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
