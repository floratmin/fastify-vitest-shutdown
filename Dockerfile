FROM node:20-bookworm
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm i
RUN pnpm run build
RUN apt-get update
RUN apt-get install -y vim
CMD ["node", "dist/main.js"]
EXPOSE 3000
