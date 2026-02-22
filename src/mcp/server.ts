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
 * MCP 서버 라이프사이클을 관리한다.
 * HTTP 서버 + Streamable HTTP 트랜스포트로 Claude Code와 통신한다.
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
				console.log(`Oh My TIL: MCP 서버 시작 (http://localhost:${this.port})`);
				resolve();
			});

			this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					const msg = `Oh My TIL: 포트 ${this.port}이 이미 사용 중입니다. 설정에서 MCP 포트를 변경해주세요.`;
					this.options?.onError?.(msg);
					console.error(msg);
				} else {
					const msg = `Oh My TIL: MCP 서버 시작 실패 — ${err.message}`;
					this.options?.onError?.(msg);
					console.error("Oh My TIL: MCP 서버 에러", err);
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
			try {
				const mcpServer = new McpServer({
					name: "oh-my-til",
					version: this.version,
				});
				registerTools(mcpServer, this.storage, this.metadata, this.tilPath);
				const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
				await mcpServer.connect(transport);
				await transport.handleRequest(req, res);
			} catch (err) {
				console.error("Oh My TIL: MCP 요청 처리 실패", err);
				if (!res.headersSent) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Internal error" }));
				}
			}
			return;
		}

		res.writeHead(404);
		res.end("Not found");
	}

	async stop(): Promise<void> {
		if (this.httpServer) {
			return new Promise<void>((resolve) => {
				this.httpServer!.close(() => {
					console.log("Oh My TIL: MCP 서버 종료");
					this.httpServer = null;
					resolve();
				});
			});
		}
	}
}
