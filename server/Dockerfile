FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY test ./test
USER node
EXPOSE 3201
CMD ["node","src/index.mjs"]
