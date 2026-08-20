FROM node:24-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY app.js ./
COPY src ./src

RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 5001

CMD ["node", "src/api.js"]
