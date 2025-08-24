# syntax=docker/dockerfile:1
FROM node:20-bullseye-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start"]