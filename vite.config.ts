import { defineConfig } from "vitest/config";

export default defineConfig({
  // 相対パスにしておくと、GitHub Pages のリポジトリ名に依存せずに配信できる
  base: "./",
  test: {
    environment: "node",
  },
});
