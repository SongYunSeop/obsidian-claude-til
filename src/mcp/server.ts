import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebSocketServer, type WebSocket } from "ws";
import { WebSocketTransport } from "./transport";
import { registerTools } from "./tools";

/**
 * MCP 서버 라이프사이클을 관리한다.
 * WebSocket 서버를 시작하고, 클라이언트 연결 시 MCP 프로토콜을 처리한다.
 */
export class TILMcpServer {
	private app: App;
	private port: number;
	private tilPath: string;
	private wss: WebSocketServer | null = null;
	private mcpServer: McpServer;
	private currentTransport: WebSocketTransport | null = null;

	constructor(app: App, port: number, tilPath: string) {
		this.app = app;
		this.port = port;
		this.tilPath = tilPath;
		this.mcpServer = new McpServer({
			name: "claude-til",
			version: "0.1.0",
		});
		registerTools(this.mcpServer, this.app, this.tilPath);
	}

	async start(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.wss = new WebSocketServer({ port: this.port });

			this.wss.on("listening", () => {
				console.log(`Claude TIL: MCP 서버 시작 (ws://localhost:${this.port})`);
				resolve();
			});

			this.wss.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					new Notice(`Claude TIL: 포트 ${this.port}이 이미 사용 중입니다. 설정에서 MCP 포트를 변경해주세요.`);
				} else {
					new Notice(`Claude TIL: MCP 서버 시작 실패 — ${err.message}`);
				}
				console.error("Claude TIL: MCP 서버 에러", err);
				reject(err);
			});

			this.wss.on("connection", (ws: WebSocket) => {
				this.handleConnection(ws);
			});
		});
	}

	private async handleConnection(ws: WebSocket): Promise<void> {
		// 기존 연결이 있으면 정리
		if (this.currentTransport) {
			await this.mcpServer.close();
			this.currentTransport = null;
		}

		// 새 McpServer 인스턴스 생성 (도구 재등록)
		this.mcpServer = new McpServer({
			name: "claude-til",
			version: "0.1.0",
		});
		registerTools(this.mcpServer, this.app, this.tilPath);

		this.currentTransport = new WebSocketTransport(ws);

		try {
			await this.mcpServer.connect(this.currentTransport);
			console.log("Claude TIL: MCP 클라이언트 연결됨");
		} catch (err) {
			console.error("Claude TIL: MCP 연결 실패", err);
			this.currentTransport = null;
		}
	}

	async stop(): Promise<void> {
		if (this.currentTransport) {
			await this.mcpServer.close();
			this.currentTransport = null;
		}
		if (this.wss) {
			return new Promise<void>((resolve) => {
				this.wss!.close(() => {
					console.log("Claude TIL: MCP 서버 종료");
					this.wss = null;
					resolve();
				});
			});
		}
	}
}
