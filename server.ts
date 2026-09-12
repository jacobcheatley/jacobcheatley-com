// dist/ is produced by `bun run build`; it does not exist when `bun run check` runs.
// @ts-expect-error - the built server module is only present at runtime
const start = (await import("./dist/server/server.js")).default as {
	fetch: (r: Request) => Promise<Response> | Response;
};
const canonical = process.env.CANONICAL_HOST;
Bun.serve({
	port: Number(process.env.PORT ?? 3000),
	async fetch(req) {
		const url = new URL(req.url);
		if (canonical && url.host !== canonical) {
			url.host = canonical;
			url.protocol = "https:";
			return Response.redirect(url.toString(), 301);
		}
		if (url.pathname.startsWith("/assets/")) {
			const f = Bun.file(`./dist/client${url.pathname}`);
			if (await f.exists())
				return new Response(f, {
					headers: { "cache-control": "public, max-age=31536000, immutable" },
				});
		}
		return start.fetch(req);
	},
});

export {};
