import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5183, strictPort: false },
  build: { target: "es2020" },
});
