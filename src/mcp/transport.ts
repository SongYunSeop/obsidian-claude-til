import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import type { WebSocket } from "ws";

/**
 * WebSocket 기반 MCP Transport 어댑터.
 * MCP SDK는 stdio/SSE 트랜스포트만 내장하므로 WebSocket용 어댑터를 직접 구현한다.
 */
export class WebSocketTransport implements Transport {
	private ws: WebSocket;

	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
	sessionId?: string;

	constructor(ws: WebSocket) {
		this.ws = ws;

		this.ws.on("message", (data: Buffer | string) => {
			try {
				const text = typeof data === "string" ? data : data.toString("utf-8");
				const message = JSON.parse(text) as JSONRPCMessage;
				this.onmessage?.(message);
			} catch (err) {
				this.onerror?.(err instanceof Error ? err : new Error(String(err)));
			}
		});

		this.ws.on("close", () => {
			this.onclose?.();
		});

		this.ws.on("error", (err: Error) => {
			this.onerror?.(err);
		});
	}

	async start(): Promise<void> {
		// WebSocket 연결은 이미 수립된 상태이므로 no-op
	}

	async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
		if (this.ws.readyState !== this.ws.OPEN) {
			throw new Error("WebSocket is not open");
		}
		const json = JSON.stringify(message);
		this.ws.send(json);
	}

	async close(): Promise<void> {
		if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
			this.ws.close();
		}
	}
}
