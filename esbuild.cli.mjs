import esbuild from "esbuild";
import builtins from "builtin-modules";
import fs from "fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));

await esbuild.build({
	entryPoints: ["src/cli/index.ts"],
	bundle: true,
	external: [...builtins, "term.js", "pty.js"],
	format: "cjs",
	target: "es2020",
	platform: "node",
	outfile: "dist/cli.js",
	banner: {
		js: "#!/usr/bin/env node\n",
	},
	loader: {
		".md": "text",
		".sh": "text",
	},
	define: {
		__CLI_VERSION__: JSON.stringify(pkg.version),
	},
});

console.log("CLI built: dist/cli.js");
