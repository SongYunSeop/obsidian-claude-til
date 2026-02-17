import { ItemView, WorkspaceLeaf, FileSystemAdapter } from "obsidian";
import { Terminal, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { IPty } from "node-pty";
import type { TILSettings } from "../settings";
import { spawnPty } from "./pty";
import { WikilinkProvider } from "./WikilinkProvider";

export const VIEW_TYPE_TIL_TERMINAL = "claude-til-terminal-view";

export class TerminalView extends ItemView {
	private terminal: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private ptyProcess: IPty | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private fitDebounceTimer: NodeJS.Timeout | null = null;
	private linkProviderDisposable: IDisposable | null = null;
	private pendingCommands: string[] = [];
	private settings: TILSettings;

	constructor(leaf: WorkspaceLeaf, settings: TILSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType(): string {
		return VIEW_TYPE_TIL_TERMINAL;
	}

	getDisplayText(): string {
		return "Claude TIL Terminal";
	}

	getIcon(): string {
		return "terminal";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass("claude-til-terminal-container");

		const content = container.createDiv({ cls: "claude-til-terminal-content" });

		// DOM이 준비된 후 터미널 초기화
		setTimeout(() => {
			this.initTerminal(content);
		}, 100);
	}

	async onClose(): Promise<void> {
		this.destroy();
	}

	/**
	 * PTY에 명령어를 전송한다.
	 * PTY가 아직 준비되지 않았으면 큐에 저장하고 준비 후 자동 전송한다.
	 */
	writeCommand(command: string): void {
		if (this.ptyProcess) {
			this.ptyProcess.write(command);
		} else {
			this.pendingCommands.push(command);
		}
	}

	focusTerminal(): void {
		this.terminal?.focus();
	}

	private getObsidianTheme() {
		const styles = getComputedStyle(document.body);
		return {
			background: styles.getPropertyValue("--background-primary").trim() || "#1e1e1e",
			foreground: styles.getPropertyValue("--text-normal").trim() || "#d4d4d4",
			cursor: styles.getPropertyValue("--text-accent").trim() || "#528bff",
			selectionBackground: styles.getPropertyValue("--text-selection").trim() || "#264f78",
		};
	}

	private initTerminal(container: HTMLElement): void {
		const theme = this.getObsidianTheme();

		this.terminal = new Terminal({
			fontSize: this.settings.fontSize,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: theme.background,
				foreground: theme.foreground,
				cursor: theme.cursor,
				selectionBackground: theme.selectionBackground,
			},
			cursorBlink: true,
			cursorStyle: "bar",
			allowTransparency: true,
			scrollback: 10000,
			cols: 80,
			rows: 24,
		});

		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(container);

		// 위키링크 감지 등록
		this.linkProviderDisposable = this.terminal.registerLinkProvider(
			new WikilinkProvider(this.app, this.terminal),
		);

		// DOM 렌더 후 fit → PTY 시작
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.fitAddon && this.terminal) {
					this.fitAddon.fit();
					this.startPty();
					this.terminal.focus();
				}
			});
		});

		// ResizeObserver로 자동 리사이즈 (debounce 50ms)
		this.resizeObserver = new ResizeObserver(() => {
			if (this.fitDebounceTimer) clearTimeout(this.fitDebounceTimer);
			this.fitDebounceTimer = setTimeout(() => {
				if (this.fitAddon && this.terminal && this.ptyProcess) {
					this.fitAddon.fit();
					this.terminal.scrollToBottom();
				}
			}, 50);
		});
		this.resizeObserver.observe(container);
	}

	private startPty(): void {
		if (!this.terminal) return;

		try {
			const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();

			this.ptyProcess = spawnPty(this.app, {
				shellPath: this.settings.shellPath,
				cols: this.terminal.cols,
				rows: this.terminal.rows,
				cwd: vaultPath,
			});

			// PTY → xterm
			this.ptyProcess.onData((data: string) => {
				this.terminal?.write(data);
			});

			// xterm → PTY
			this.terminal.onData((data: string) => {
				this.ptyProcess?.write(data);
			});

			// 리사이즈 동기화
			this.terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
				this.ptyProcess?.resize(cols, rows);
			});

			// claude 자동 실행
			if (this.settings.autoLaunchClaude) {
				const cmd = this.settings.resumeLastSession
					? "clear && claude --continue\r"
					: "clear && claude\r";
				setTimeout(() => {
					this.ptyProcess?.write(cmd);
					// Claude 초기화 후 대기 명령어 전송
					setTimeout(() => this.flushPendingCommands(), 2000);
				}, 300);
			} else {
				setTimeout(() => this.flushPendingCommands(), 100);
			}
		} catch (error) {
			console.error("Claude TIL: PTY 시작 실패", error);
			this.terminal.write("\r\n\x1b[31mError: 터미널 시작에 실패했습니다.\x1b[0m\r\n");
			this.terminal.write(`\r\n${error}\r\n`);
		}
	}

	private flushPendingCommands(): void {
		for (const cmd of this.pendingCommands) {
			this.ptyProcess?.write(cmd);
		}
		this.pendingCommands = [];
	}

	private destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		if (this.fitDebounceTimer) {
			clearTimeout(this.fitDebounceTimer);
			this.fitDebounceTimer = null;
		}

		this.linkProviderDisposable?.dispose();
		this.linkProviderDisposable = null;

		if (this.ptyProcess) {
			this.ptyProcess.kill();
			this.ptyProcess = null;
		}

		if (this.terminal) {
			this.terminal.dispose();
			this.terminal = null;
		}

		this.fitAddon = null;
	}
}
