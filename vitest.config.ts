import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: ["__tests__/e2e/**", "node_modules/**"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			exclude: ["src/obsidian/**"],
		},
	},
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "__tests__/mock-obsidian.ts"),
		},
	},
});
