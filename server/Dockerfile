FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p logs && chown -R node:node /app

USER node

EXPOSE 3001 3002

CMD ["npm", "start"]
