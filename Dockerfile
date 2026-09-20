FROM oven/bun:1.4.2-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
# The Blog editor is local only: the build drops its route files, and with
# them its server functions and its screens. Nothing it is made of may reach
# the image.
RUN ! grep -rqE 'blog-editor\.(fn|server)|Create Draft|Unsaved changes' dist
RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts /app/package.json /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
