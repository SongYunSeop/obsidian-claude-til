import { ItemView, WorkspaceLeaf, FileSystemAdapter } from "obsidian";
import { Terminal, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { IPty } from "node-pty";
import type { TILSettings } from "../settings";
import { spawnPty } from "./pty";
import { MarkdownLinkProvider, FilepathLinkProvider, Osc8LinkProvider } from "./MarkdownLinkProvider";
import { handleShiftEnter } from "../../core/keyboard";

export const VIEW_TYPE_TIL_TERMINAL = "oh-my-til-terminal-view";

export class TerminalView extends ItemView {
	private terminal: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private ptyProcess: IPty | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private fitDebounceTimer: NodeJS.Timeout | null = null;
	private linkProviderDisposable: IDisposable | null = null;
	private filepathLinkProviderDisposable: IDisposable | null = null;
	private osc8LinkProvider: Osc8LinkProvider | null = null;
	private osc8LinkProviderDisposable: IDisposable | null = null;
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
		return "Oh My TIL Terminal";
	}

	getIcon(): string {
		return "terminal";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass("oh-my-til-terminal-container");

		// Force-lock scroll on Obsidian's view-content element
		// Prevents the browser from scrolling the parent container when xterm.js hidden textarea gains focus
		const viewContent = container as HTMLElement;
		viewContent.style.overflow = "hidden";
		this.scrollLockHandler = () => {
			if (viewContent.scrollTop !== 0) viewContent.scrollTop = 0;
			if (viewContent.scrollLeft !== 0) viewContent.scrollLeft = 0;
		};
		viewContent.addEventListener("scroll", this.scrollLockHandler);

		const content = container.createDiv({ cls: "oh-my-til-terminal-content" });

		// Initialize terminal after DOM is ready
		setTimeout(() => {
			this.initTerminal(content);
		}, 100);
	}

	async onClose(): Promise<void> {
		this.destroy();
	}

	/**
	 * Sends a command to the PTY.
	 * If the PTY is not ready yet, queues the command and sends it automatically once ready.
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
			fontFamily: this.settings.fontFamily,
			lineHeight: this.settings.lineHeight,
			theme: {
				background: theme.background,
				foreground: theme.foreground,
				cursor: theme.cursor,
				selectionBackground: theme.selectionBackground,
			},
			cursorBlink: true,
			cursorStyle: "bar",
			allowTransparency: true,
			allowProposedApi: true,
			scrollback: 10000,
			cols: 80,
			rows: 24,
		});

		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(container);

		// xterm.js sends \r(0x0d) for both Shift+Enter and Enter,
		// but Claude Code distinguishes \r(submit) from \n(newline).
		// Block all Shift+Enter events (keydown/keypress/keyup) and
		// send \n directly to the PTY only on keydown to support multiline input.
		this.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
			const result = handleShiftEnter(e);
			if (result.sendNewline) {
				this.ptyProcess?.write("\n");
			}
			return result.allowDefault;
		});

		// Register markdown link detection
		this.linkProviderDisposable = this.terminal.registerLinkProvider(
			new MarkdownLinkProvider(this.app, this.terminal),
		);

		// Register TIL file path detection (til/category/slug.md pattern)
		this.filepathLinkProviderDisposable = this.terminal.registerLinkProvider(
			new FilepathLinkProvider(this.app, this.terminal),
		);

		// Register OSC 8 hyperlink detection (parser-based URL tracking + click handling)
		this.osc8LinkProvider = new Osc8LinkProvider(this.app, this.terminal);
		this.osc8LinkProviderDisposable = this.terminal.registerLinkProvider(this.osc8LinkProvider);

		// After DOM render: fit → start PTY
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.fitAddon && this.terminal) {
					this.fitAddon.fit();
					this.startPty();
					this.terminal.focus();
				}
			});
		});

		// Auto-resize via ResizeObserver (debounce 50ms)
		// Only run fit when the container pixel size actually changes (prevents unnecessary scroll jumps)
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

			// PTY → xterm (prevent scroll jump: call scrollToBottom every frame in follow mode)
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

			// Sync resize
			this.terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
				this.ptyProcess?.resize(cols, rows);
			});

			// Auto-launch Claude
			if (this.settings.autoLaunchClaude) {
				const args = [
					this.settings.resumeLastSession ? "--continue" : "",
					this.settings.claudeArgs?.trim() ?? "",
				].filter(Boolean).join(" ");
				const cmd = args
					? `clear && claude ${args}\r`
					: "clear && claude\r";
				setTimeout(() => {
					this.ptyProcess?.write(cmd);
					// Prompt-detection based flush (10s timeout fallback)
					this.waitForClaudeReady(() => this.flushPendingCommands());
				}, 300);
			} else {
				setTimeout(() => this.flushPendingCommands(), 100);
			}
		} catch (error) {
			console.error("Oh My TIL: PTY start failed", error);
			this.terminal.write("\r\n\x1b[31mError: Failed to start terminal.\x1b[0m\r\n");
			this.terminal.write(`\r\n${error}\r\n`);
		}
	}

	private waitForClaudeReady(callback: () => void): void {
		const TIMEOUT = 10_000;
		let resolved = false;
		// Claude Code prompt pattern: > or ❯ at end of line (after ANSI escapes)
		const CLAUDE_PROMPT_RE = /(?:^|\n)\s*[>❯]\s*$/;

		const disposable = this.terminal?.onData((data: string) => {
			if (!resolved && CLAUDE_PROMPT_RE.test(data)) {
				resolved = true;
				clearTimeout(timer);
				disposable?.dispose();
				// Brief delay after prompt output
				setTimeout(callback, 200);
			}
		});

		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				disposable?.dispose();
				callback();
			}
		}, TIMEOUT);
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

		this.filepathLinkProviderDisposable?.dispose();
		this.filepathLinkProviderDisposable = null;

		this.osc8LinkProviderDisposable?.dispose();
		this.osc8LinkProviderDisposable = null;
		this.osc8LinkProvider?.dispose();
		this.osc8LinkProvider = null;

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
