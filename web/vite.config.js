import { defineConfig } from "vite";
// allow importing the shared client crypto modules from ../client/src
export default defineConfig({ server: { fs: { allow: [".."] } } });
