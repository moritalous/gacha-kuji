import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  // 相対パスにしておくと、GitHub Pages のリポジトリ名に依存せずに配信できる
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        admin: resolve(root, "admin.html"),
      },
    },
  },
  test: {
    environment: "node",
  },
});
