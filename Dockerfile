FROM oven/bun:1.4.2-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts /app/package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
