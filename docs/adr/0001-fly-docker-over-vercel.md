# Host on Fly.io as a Docker container rather than Vercel

Vercel is the zero-config path for Next.js, but the site will host Projects that need a persistent process (multiplayer games, ARGs, WebSockets), which serverless hosting does not provide. We deploy a Docker image to a Fly.io machine in `syd`: portable to any container host, no Vercel-only features, and a fixed small monthly cost instead of per-request billing.
