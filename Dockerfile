FROM node:20-alpine
WORKDIR /app
COPY dist-app/index.js .
EXPOSE 3000
CMD ["node", "index.js"]
