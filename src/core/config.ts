import * as path from "path";
import * as fs from "fs";

export interface OmtConfig {
	deploy?: {
		"til-path"?: string;
		out?: string;
		title?: string;
		subtitle?: string;
		github?: string;
	};
}

/** @deprecated Use OmtConfig instead */
export type SiteConfig = OmtConfig;

/**
 * Reads the oh-my-til.json config file from the vault root.
 * Returns an empty object if the file is missing or parsing fails.
 */
export function loadOmtConfig(basePath: string): OmtConfig {
	const configPath = path.join(basePath, "oh-my-til.json");
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/** @deprecated Use loadOmtConfig instead */
export const loadSiteConfig = loadOmtConfig;
