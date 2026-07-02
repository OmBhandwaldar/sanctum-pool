import { defineConfig } from "vite";
// allow importing shared client crypto modules from ../client/src.
export default defineConfig({
  server: { fs: { allow: [".."] } },
  define: { global: "globalThis" },
});
