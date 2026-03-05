import { describe, it, expect, afterEach } from "vitest";
import * as http from "http";

// Tests HTTP routing/CORS/error handling of the MCP server.
// Verifies only the core behavior of the handleRequest logic without the actual McpServer dependency.

// Reproduces the handleRequest routing logic from server.ts
function createTestServer(): http.Server {
	return http.createServer(async (req, res) => {
		// CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
		res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
			// MCP handler (replaced with a simple response in tests)
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
			return;
		}

		res.writeHead(404);
		res.end("Not found");
	});
}

function request(
	port: number,
	options: { method?: string; path?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{ hostname: "127.0.0.1", port, method: options.method ?? "GET", path: options.path ?? "/" },
			(res) => {
				let body = "";
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
			},
		);
		req.on("error", reject);
		req.end();
	});
}

let server: http.Server | null = null;

function stopServer(): Promise<void> {
	return new Promise((resolve) => {
		if (server) {
			server.close(() => {
				server = null;
				resolve();
			});
		} else {
			resolve();
		}
	});
}

// Clean up server after each test
afterEach(async () => {
	await stopServer();
});

describe("MCP server HTTP routing", () => {
	async function startAndGetPort(): Promise<number> {
		server = createTestServer();
		return new Promise((resolve) => {
			server!.listen(0, "127.0.0.1", () => {
				const addr = server!.address() as { port: number };
				resolve(addr.port);
			});
		});
	}

	it("returns 204 + CORS headers for OPTIONS request", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { method: "OPTIONS", path: "/mcp" });

		expect(res.status).toBe(204);
		expect(res.headers["access-control-allow-origin"]).toBe("*");
		expect(res.headers["access-control-allow-methods"]).toContain("POST");
		expect(res.headers["access-control-allow-headers"]).toContain("mcp-session-id");
	});

	it("returns 200 for /mcp path", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { method: "POST", path: "/mcp" });

		expect(res.status).toBe(200);
		expect(JSON.parse(res.body)).toEqual({ ok: true });
	});

	it("also matches /mcp?session=xxx query string", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { method: "POST", path: "/mcp?session=abc123" });

		expect(res.status).toBe(200);
	});

	it("returns 404 for other paths", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { path: "/" });

		expect(res.status).toBe(404);
	});

	it("returns 404 for paths that are not /mcp", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { path: "/api/something" });

		expect(res.status).toBe(404);
	});

	it("includes CORS headers in all responses", async () => {
		const p = await startAndGetPort();
		const res = await request(p, { path: "/nonexistent" });

		expect(res.headers["access-control-allow-origin"]).toBe("*");
	});
});

describe("MCP server lifecycle", () => {
	it("can be stopped after starting", async () => {
		server = createTestServer();
		await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));

		const addr = server!.address() as { port: number };
		expect(addr.port).toBeGreaterThan(0);

		await stopServer();
		expect(server).toBeNull();
	});

	it("throws error on port conflict", async () => {
		// Start first server
		const server1 = createTestServer();
		const port = await new Promise<number>((resolve) => {
			server1.listen(0, "127.0.0.1", () => {
				resolve((server1.address() as { port: number }).port);
			});
		});

		// Attempt to start second server on the same port
		const server2 = createTestServer();
		const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
			server2.on("error", (err) => resolve(err as NodeJS.ErrnoException));
			server2.listen(port, "127.0.0.1");
		});

		expect(error.code).toBe("EADDRINUSE");

		// Cleanup
		await new Promise<void>((resolve) => server1.close(() => resolve()));
	});
});
