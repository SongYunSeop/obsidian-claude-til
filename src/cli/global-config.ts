import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".config", "oh-my-til");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface AiConfig {
	provider: "anthropic" | "openai" | "ollama";
	model?: string;
	apiKey?: string;
}

export interface GlobalConfig {
	vault?: string;
	ai?: AiConfig;
}

const VALID_PROVIDERS = ["anthropic", "openai", "ollama"] as const;

export function readConfig(): GlobalConfig {
	if (!fs.existsSync(CONFIG_FILE)) return {};
	try {
		const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
		return JSON.parse(raw) as GlobalConfig;
	} catch {
		return {};
	}
}

export function writeConfig(config: GlobalConfig): void {
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** Resolve config with env var fallbacks. */
export function getConfig(): GlobalConfig {
	const config = readConfig();

	// Vault fallback
	if (!config.vault && process.env["TIL_VAULT_PATH"]) {
		config.vault = process.env["TIL_VAULT_PATH"];
	}

	// API key fallback per provider
	if (config.ai && !config.ai.apiKey) {
		const provider = config.ai.provider;
		if (provider === "anthropic" && process.env["ANTHROPIC_API_KEY"]) {
			config.ai.apiKey = process.env["ANTHROPIC_API_KEY"];
		} else if (provider === "openai" && process.env["OPENAI_API_KEY"]) {
			config.ai.apiKey = process.env["OPENAI_API_KEY"];
		}
	}

	// Expand ~ in vault path
	if (config.vault?.startsWith("~")) {
		config.vault = path.join(os.homedir(), config.vault.slice(1));
	}

	return config;
}

function maskApiKey(key: string): string {
	if (key.length <= 8) return "***";
	return key.slice(0, 4) + "..." + key.slice(-4);
}

export function runConfigCommand(args: string[]): void {
	const subcommand = args[0];

	if (!subcommand || subcommand === "get") {
		const config = readConfig();
		const display: Record<string, unknown> = {};

		if (config.vault) display["vault"] = config.vault;
		if (config.ai) {
			display["ai"] = {
				provider: config.ai.provider,
				...(config.ai.model ? { model: config.ai.model } : {}),
				...(config.ai.apiKey ? { apiKey: maskApiKey(config.ai.apiKey) } : {}),
			};
		}

		if (Object.keys(display).length === 0) {
			console.log("No config set. Use `oh-my-til config set <key> <value>`");
		} else {
			console.log(JSON.stringify(display, null, 2));
		}
		return;
	}

	if (subcommand === "set") {
		const key = args[1];
		const value = args[2];

		if (!key || value === undefined) {
			console.error("Usage: oh-my-til config set <key> <value>");
			console.error("Keys: vault, ai.provider, ai.model, ai.apiKey");
			process.exit(1);
		}

		const config = readConfig();

		if (key === "vault") {
			config.vault = value;
			writeConfig(config);
			console.log(`vault = ${value}`);
		} else if (key === "ai.provider") {
			if (!VALID_PROVIDERS.includes(value as (typeof VALID_PROVIDERS)[number])) {
				console.error(`Invalid provider. Choose from: ${VALID_PROVIDERS.join(", ")}`);
				process.exit(1);
			}
			config.ai = { ...config.ai, provider: value as AiConfig["provider"] };
			writeConfig(config);
			console.log(`ai.provider = ${value}`);
		} else if (key === "ai.model") {
			if (!config.ai) {
				console.error("Set ai.provider first.");
				process.exit(1);
			}
			config.ai.model = value;
			writeConfig(config);
			console.log(`ai.model = ${value}`);
		} else if (key === "ai.apiKey") {
			if (!config.ai) {
				console.error("Set ai.provider first.");
				process.exit(1);
			}
			config.ai.apiKey = value;
			writeConfig(config);
			console.log(`ai.apiKey = ${maskApiKey(value)}`);
		} else {
			console.error(`Unknown key: ${key}`);
			console.error("Keys: vault, ai.provider, ai.model, ai.apiKey");
			process.exit(1);
		}
		return;
	}

	console.error(`Unknown config subcommand: ${subcommand}`);
	process.exit(1);
}
