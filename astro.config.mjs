import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://romantelescope.space",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
});
