import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as http from "http";
import type { FileStorage } from "../ports/storage";
import type { MetadataProvider } from "../ports/metadata";
import { registerTools } from "./tools";

export interface McpServerOptions {
	onError?: (message: string) => void;
}

/**
 * Manages MCP server lifecycle.
 * Communicates with Claude Code via HTTP server + Streamable HTTP transport.
 */
export class TILMcpServer {
	private storage: FileStorage;
	private metadata: MetadataProvider;
	private port: number;
	private tilPath: string;
	private version: string;
	private options: McpServerOptions | undefined;
	private httpServer: http.Server | null = null;

	constructor(
		storage: FileStorage,
		metadata: MetadataProvider,
		port: number,
		tilPath: string,
		version: string,
		options?: McpServerOptions,
	) {
		this.storage = storage;
		this.metadata = metadata;
		this.port = port;
		this.tilPath = tilPath;
		this.version = version;
		this.options = options;
	}

	async start(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.httpServer = http.createServer(async (req, res) => {
				await this.handleRequest(req, res);
			});

			this.httpServer.on("listening", () => {
				console.log(`Oh My TIL: MCP server started (http://localhost:${this.port})`);
				resolve();
			});

			this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					const msg = `Oh My TIL: Port ${this.port} is already in use. Please change the MCP port in settings.`;
					this.options?.onError?.(msg);
					console.error(msg);
				} else {
					const msg = `Oh My TIL: MCP server failed to start — ${err.message}`;
					this.options?.onError?.(msg);
					console.error("Oh My TIL: MCP server error", err);
				}
				reject(err);
			});

			this.httpServer.listen(this.port);
		});
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
			const mcpServer = new McpServer({
				name: "oh-my-til",
				version: this.version,
			});
			registerTools(mcpServer, this.storage, this.metadata, this.tilPath);
			const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

			const cleanup = async () => {
				await transport.close();
				await mcpServer.close();
			};

			try {
				await mcpServer.connect(transport);
				await transport.handleRequest(req, res);
			} catch (err) {
				console.error("Oh My TIL: MCP request handling failed", err);
				if (!res.headersSent) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Internal error" }));
				}
			} finally {
				// POST (stateless): clean up immediately after handleRequest.
				// GET/SSE: clean up when the response stream ends.
				if (res.writableEnded) {
					await cleanup();
				} else {
					res.on("close", () => void cleanup());
				}
			}
			return;
		}

		res.writeHead(404);
		res.end("Not found");
	}

	async stop(): Promise<void> {
		if (this.httpServer) {
			this.httpServer.closeAllConnections();
			return new Promise<void>((resolve) => {
				this.httpServer!.close(() => {
					console.log("Oh My TIL: MCP server stopped");
					this.httpServer = null;
					resolve();
				});
			});
		}
	}
}
