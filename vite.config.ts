import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        // The Blog editor is local only: dropping its route files from the
        // build drops the routes, the editor and its server functions with
        // them. The checked-in route tree is the dev one, which has them.
        routeFileIgnorePattern:
          command === "build" ? "^blog\\.write\\b" : undefined,
      },
    }),
    viteReact(),
  ],
}));
