import { ItemView, WorkspaceLeaf, FileSystemAdapter } from "obsidian";
import { Terminal, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { IPty } from "node-pty";
import type { TILSettings } from "../settings";
import { spawnPty } from "./pty";
import { MarkdownLinkProvider } from "./MarkdownLinkProvider";
import { handleShiftEnter } from "./keyboard";

export const VIEW_TYPE_TIL_TERMINAL = "claude-til-terminal-view";

export class TerminalView extends ItemView {
	private terminal: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private ptyProcess: IPty | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private fitDebounceTimer: NodeJS.Timeout | null = null;
	private linkProviderDisposable: IDisposable | null = null;
	private pendingCommands: string[] = [];
	private lastContainerWidth = 0;
	private lastContainerHeight = 0;
	private scrollLockHandler: (() => void) | null = null;
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

		// Obsidian의 view-content 스크롤을 강제 잠금
		// xterm.js의 hidden textarea focus 시 브라우저가 부모 컨테이너를 스크롤하는 것을 방지
		const viewContent = container as HTMLElement;
		viewContent.style.overflow = "hidden";
		this.scrollLockHandler = () => {
			if (viewContent.scrollTop !== 0) viewContent.scrollTop = 0;
			if (viewContent.scrollLeft !== 0) viewContent.scrollLeft = 0;
		};
		viewContent.addEventListener("scroll", this.scrollLockHandler);

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

		// xterm.js는 Shift+Enter와 Enter 모두 \r(0x0d)을 전송하지만
		// Claude Code는 \r(submit)과 \n(newline)을 구분함
		// Shift+Enter의 모든 이벤트(keydown/keypress/keyup)를 차단하고
		// keydown에서만 \n을 직접 PTY에 전송하여 multiline 입력 지원
		this.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
			const result = handleShiftEnter(e);
			if (result.sendNewline) {
				this.ptyProcess?.write("\n");
			}
			return result.allowDefault;
		});

		// 마크다운 링크 감지 등록
		this.linkProviderDisposable = this.terminal.registerLinkProvider(
			new MarkdownLinkProvider(this.app, this.terminal),
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
		// 컨테이너 픽셀 크기가 실제로 변했을 때만 fit 실행 (불필요한 스크롤 점프 방지)
		this.resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (width === this.lastContainerWidth && height === this.lastContainerHeight) return;
			this.lastContainerWidth = width;
			this.lastContainerHeight = height;

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

			// PTY → xterm (스크롤 점프 방지: follow mode일 때 매 프레임 scrollToBottom)
			let followMode = true;
			let rafPending = false;
			const viewport = this.terminal.element?.querySelector(".xterm-viewport") as HTMLElement | null;
			if (viewport) {
				viewport.addEventListener("scroll", () => {
					followMode = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 10;
				}, { passive: true });
			}

			this.ptyProcess.onData((data: string) => {
				this.terminal?.write(data);
				if (followMode && !rafPending) {
					rafPending = true;
					requestAnimationFrame(() => {
						rafPending = false;
						if (followMode) {
							this.terminal?.scrollToBottom();
						}
					});
				}
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
		if (this.scrollLockHandler) {
			const viewContent = this.containerEl.children[1] as HTMLElement | undefined;
			viewContent?.removeEventListener("scroll", this.scrollLockHandler);
			this.scrollLockHandler = null;
		}

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
