import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, "../../dist/cli.js");

describe("CLI E2E", () => {
	let tmpDir: string;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-til-e2e-"));
		// Create a minimal til directory so MCP server has something to work with
		fs.mkdirSync(path.join(tmpDir, "til"), { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("--help prints usage and exits with code 0", async () => {
		const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, "--help"]);
		expect(stdout).toContain("oh-my-til");
		expect(stdout).toContain("Usage:");
		expect(stdout).toContain("mcp");
	});

	test("-h also prints usage", async () => {
		const { stdout } = await execFileAsync("node", [CLI_PATH, "-h"]);
		expect(stdout).toContain("Usage:");
	});

	test("--version prints version", async () => {
		const { stdout } = await execFileAsync("node", [CLI_PATH, "--version"]);
		expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test("unknown command exits with code 1", async () => {
		await expect(
			execFileAsync("node", [CLI_PATH, "nonexistent"]),
		).rejects.toMatchObject({ code: 1 });
	});

	test("cold start time < 3s", async () => {
		const start = performance.now();
		await execFileAsync("node", [CLI_PATH, "--help"]);
		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(3000);
	});

	test("mcp command starts and responds to stdio", async () => {
		const { spawn } = await import("child_process");
		const proc = spawn("node", [CLI_PATH, "mcp", tmpDir], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		try {
			// Wait for stderr startup message
			const ready = await new Promise<boolean>((resolve) => {
				const timeout = setTimeout(() => resolve(false), 5000);
				proc.stderr!.on("data", (data: Buffer) => {
					if (data.toString().includes("MCP server running")) {
						clearTimeout(timeout);
						resolve(true);
					}
				});
			});

			expect(ready).toBe(true);
		} finally {
			proc.kill("SIGTERM");
		}
	});
});
