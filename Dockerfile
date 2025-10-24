# Dockerfile for streetwarp-web
# Builds the app and runs the bundled server. Persist the generated
# videos/metadata by mounting the host `video` directory into the container

FROM node:22-alpine

WORKDIR /app

COPY package.json yarn.lock* ./

RUN yarn

COPY . .
RUN yarn build

EXPOSE 4041
VOLUME ["/app/video"]

ENV NODE_ENV=production
CMD ["node", "dist/server.bundle.js"]
