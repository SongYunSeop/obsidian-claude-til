import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";

const PLUGIN_ARTIFACTS = ["main.js", "manifest.json", "styles.css", "migrate-links.mjs"];
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-\S+)?$/;

export interface InstallResult {
	success: boolean;
	pluginDir: string;
	warnings: string[];
	rebuilt: boolean;
}

/**
 * Returns the list of plugin artifact absolute paths to copy from packageRoot.
 */
export function getPluginArtifacts(packageRoot: string): string[] {
	return PLUGIN_ARTIFACTS.map((f) => path.join(packageRoot, f));
}

/**
 * Validates that a string looks like a semver Electron version.
 */
export function isValidVersion(v: string): boolean {
	return VERSION_PATTERN.test(v);
}

/**
 * Generates plugin package.json content with native dependencies.
 * NOTE: dependency versions are synced with scripts/deploy.sh — update both together.
 */
export function buildPluginPackageJson(): string {
	return JSON.stringify(
		{
			name: "oh-my-til",
			version: "1.0.0",
			private: true,
			type: "commonjs",
			dependencies: {
				ajv: "^8.18.0",
				"ajv-formats": "^3.0.1",
				"node-pty": "^1.1.0",
			},
		},
		null,
		2,
	);
}

/**
 * Determines if node-pty rebuild is needed by comparing Electron versions.
 */
export function needsRebuild(current: string | null, cached: string | null): boolean {
	if (!current) return false;
	if (!cached) return true;
	return current !== cached;
}

/**
 * Detects the Electron version used by Obsidian.
 * Priority: ELECTRON_VERSION env var → macOS Obsidian.app plist → null
 */
export function detectElectronVersion(override?: string): string | null {
	if (override && isValidVersion(override)) return override;

	const envVersion = process.env["ELECTRON_VERSION"];
	if (envVersion && isValidVersion(envVersion)) return envVersion;

	// macOS: detect from Obsidian.app
	const plist =
		"/Applications/Obsidian.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist";
	if (fs.existsSync(plist)) {
		try {
			const output = execFileSync(
				"/usr/libexec/PlistBuddy",
				["-c", "Print :CFBundleVersion", plist],
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
			).trim();
			if (output && isValidVersion(output)) return output;
		} catch {
			// PlistBuddy failed — fall through
		}
	}

	return null;
}

/**
 * Installs Obsidian plugin artifacts into the vault's plugin directory.
 */
export function installObsidianPlugin(
	vaultPath: string,
	packageRoot: string,
	options?: { electronVersion?: string },
): InstallResult {
	const pluginDir = path.join(vaultPath, ".obsidian", "plugins", "oh-my-til");
	const warnings: string[] = [];
	let rebuilt = false;

	// 1. Verify artifacts exist
	const artifacts = getPluginArtifacts(packageRoot);
	for (const artifact of artifacts) {
		if (!fs.existsSync(artifact)) {
			return {
				success: false,
				pluginDir,
				warnings: [`Missing artifact: ${artifact}`],
				rebuilt: false,
			};
		}
	}

	// 2. Create plugin directory
	fs.mkdirSync(pluginDir, { recursive: true });

	// 3. Copy artifacts
	for (const artifact of artifacts) {
		const dest = path.join(pluginDir, path.basename(artifact));
		fs.copyFileSync(artifact, dest);
	}

	// 4. Create package.json if not exists
	const pkgJsonPath = path.join(pluginDir, "package.json");
	if (!fs.existsSync(pkgJsonPath)) {
		fs.writeFileSync(pkgJsonPath, buildPluginPackageJson());
	}

	// 5. npm install (production deps only)
	try {
		execFileSync("npm", ["install", "--omit=dev"], {
			cwd: pluginDir,
			stdio: ["pipe", "pipe", "pipe"],
			encoding: "utf-8",
		});
	} catch (err) {
		return {
			success: false,
			pluginDir,
			warnings: [`npm install failed: ${err instanceof Error ? err.message : String(err)}`],
			rebuilt: false,
		};
	}

	// 6. Detect Electron version
	const electronVersion = detectElectronVersion(options?.electronVersion);
	if (!electronVersion) {
		warnings.push(
			"Could not detect Electron version. node-pty rebuild skipped.\n" +
				"  Set ELECTRON_VERSION env var or rebuild manually:\n" +
				"  ELECTRON_VERSION=<version> npx @electron/rebuild -m <plugin>/node_modules/node-pty -v <version>",
		);
		return { success: true, pluginDir, warnings, rebuilt: false };
	}

	// 7. Check cached version, rebuild if needed
	const versionFile = path.join(pluginDir, ".electron-version");
	const cachedVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf-8").trim() : null;

	if (!needsRebuild(electronVersion, cachedVersion)) {
		return { success: true, pluginDir, warnings, rebuilt: false };
	}

	try {
		const ptyModulePath = path.join(pluginDir, "node_modules", "node-pty");
		execFileSync("npx", ["@electron/rebuild", "-m", ptyModulePath, "-v", electronVersion], {
			cwd: pluginDir,
			stdio: ["pipe", "pipe", "pipe"],
			encoding: "utf-8",
		});
		fs.writeFileSync(versionFile, electronVersion);
		rebuilt = true;
	} catch (err) {
		warnings.push(
			`@electron/rebuild failed: ${err instanceof Error ? err.message : String(err)}\n` +
				`  You can rebuild manually:\n` +
				`  cd ${pluginDir} && npx @electron/rebuild -m node_modules/node-pty -v ${electronVersion}`,
		);
	}

	return { success: true, pluginDir, warnings, rebuilt };
}
