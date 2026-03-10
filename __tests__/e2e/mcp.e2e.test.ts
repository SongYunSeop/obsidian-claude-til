import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const CLI_PATH = path.resolve(__dirname, "../../dist/cli.js");

/** Send a JSON-RPC request over stdio and read the response */
function sendJsonRpc(
	proc: ChildProcess,
	request: Record<string, unknown>,
	timeoutMs = 5000,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`JSON-RPC response timeout after ${timeoutMs}ms`)),
			timeoutMs,
		);

		let buffer = "";
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();

			// MCP uses newline-delimited JSON-RPC
			const lines = buffer.split("\n");
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const parsed = JSON.parse(trimmed);
					if (parsed.id === request.id || parsed.method === "notifications") {
						clearTimeout(timeout);
						proc.stdout!.off("data", onData);
						resolve(parsed);
						return;
					}
				} catch {
					// Not complete JSON yet, continue buffering
				}
			}
		};

		proc.stdout!.on("data", onData);

		const body = JSON.stringify(request);
		proc.stdin!.write(body + "\n");
	});
}

describe("MCP E2E", () => {
	let tmpDir: string;
	let proc: ChildProcess;

	beforeAll(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-til-mcp-e2e-"));
		fs.mkdirSync(path.join(tmpDir, "til", "typescript"), { recursive: true });
		// Create a sample TIL file
		fs.writeFileSync(
			path.join(tmpDir, "til", "typescript", "generics.md"),
			`---\ntags:\n  - til\ndate: "2025-01-15"\n---\n# TypeScript Generics\n\nGenerics allow creating reusable components.\n`,
		);

		proc = spawn("node", [CLI_PATH, "mcp", tmpDir], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Wait for server to be ready
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("MCP server did not start")), 5000);
			proc.stderr!.on("data", (data: Buffer) => {
				if (data.toString().includes("MCP server running")) {
					clearTimeout(timeout);
					resolve();
				}
			});
		});
	});

	afterAll(() => {
		proc?.kill("SIGTERM");
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("initialize handshake succeeds", async () => {
		const start = performance.now();

		const response = await sendJsonRpc(proc, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "e2e-test", version: "1.0.0" },
			},
		});

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(2000);

		expect(response).toHaveProperty("result");
		const result = response.result as Record<string, unknown>;
		expect(result).toHaveProperty("protocolVersion");
		expect(result).toHaveProperty("serverInfo");
		const serverInfo = result.serverInfo as Record<string, unknown>;
		expect(serverInfo.name).toBe("oh-my-til");

		// Send initialized notification (required by protocol)
		proc.stdin!.write(JSON.stringify({
			jsonrpc: "2.0",
			method: "notifications/initialized",
		}) + "\n");
	});

	test("tools/list returns available tools", async () => {
		const start = performance.now();

		const response = await sendJsonRpc(proc, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		});

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(2000);

		expect(response).toHaveProperty("result");
		const result = response.result as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
		expect(result).toHaveProperty("tools");
		expect(Array.isArray(result.tools)).toBe(true);
		expect(result.tools.length).toBeGreaterThan(0);

		// Each tool should have name, description, inputSchema
		for (const tool of result.tools) {
			expect(tool).toHaveProperty("name");
			expect(tool).toHaveProperty("description");
			expect(tool).toHaveProperty("inputSchema");
			expect(typeof tool.name).toBe("string");
			expect(typeof tool.description).toBe("string");
		}
	});

	test("tools/call with learning-context returns content", async () => {
		const start = performance.now();

		const response = await sendJsonRpc(proc, {
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: "learning-context",
				arguments: { topic: "typescript" },
			},
		});

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(2000);

		expect(response).toHaveProperty("result");
		const result = response.result as { content: Array<{ type: string; text: string }> };
		expect(result).toHaveProperty("content");
		expect(Array.isArray(result.content)).toBe(true);
		expect(result.content.length).toBeGreaterThan(0);
		expect(result.content[0]!.type).toBe("text");
	});
});
