import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as http from "http";
import { registerTools } from "./tools";

/**
 * MCP 서버 라이프사이클을 관리한다.
 * HTTP 서버 + Streamable HTTP 트랜스포트로 Claude Code와 통신한다.
 */
export class TILMcpServer {
	private app: App;
	private port: number;
	private tilPath: string;
	private httpServer: http.Server | null = null;

	constructor(app: App, port: number, tilPath: string) {
		this.app = app;
		this.port = port;
		this.tilPath = tilPath;
	}

	async start(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.httpServer = http.createServer(async (req, res) => {
				await this.handleRequest(req, res);
			});

			this.httpServer.on("listening", () => {
				console.log(`Claude TIL: MCP 서버 시작 (http://localhost:${this.port})`);
				resolve();
			});

			this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					new Notice(`Claude TIL: 포트 ${this.port}이 이미 사용 중입니다. 설정에서 MCP 포트를 변경해주세요.`);
				} else {
					new Notice(`Claude TIL: MCP 서버 시작 실패 — ${err.message}`);
				}
				console.error("Claude TIL: MCP 서버 에러", err);
				reject(err);
			});

			this.httpServer.listen(this.port);
		});
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
			try {
				const mcpServer = new McpServer({
					name: "claude-til",
					version: "0.1.0",
				});
				registerTools(mcpServer, this.app, this.tilPath);
				const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
				await mcpServer.connect(transport);
				await transport.handleRequest(req, res);
			} catch (err) {
				console.error("Claude TIL: MCP 요청 처리 실패", err);
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
					console.log("Claude TIL: MCP 서버 종료");
					this.httpServer = null;
					resolve();
				});
			});
		}
	}
}
