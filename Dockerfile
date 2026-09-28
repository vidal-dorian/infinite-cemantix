FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY words ./words
ENV PORT=3000 DATA_DIR=/app/data NODE_ENV=production
VOLUME /app/data
EXPOSE 3000
# Au premier démarrage, le modèle (≈ 106 Mo) est téléchargé dans le volume puis vérifié (SHA-256).
CMD ["sh", "-c", "node scripts/download-model.js && node server/index.js"]
