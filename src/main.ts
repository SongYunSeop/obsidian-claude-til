import { Plugin } from "obsidian";
import { TerminalView, VIEW_TYPE_TIL_TERMINAL } from "./terminal/TerminalView";
import { DashboardView, VIEW_TYPE_TIL_DASHBOARD } from "./dashboard/DashboardView";
import { TILSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { TILSettings } from "./settings";
import { TILWatcher } from "./watcher";
import { TILMcpServer } from "./mcp/server";
import { installSkills } from "./skills";

export default class TILPlugin extends Plugin {
	settings: TILSettings = DEFAULT_SETTINGS;
	private watcher: TILWatcher | null = null;
	private mcpServer: TILMcpServer | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_TIL_TERMINAL,
			(leaf) => new TerminalView(leaf, this.settings)
		);

		this.registerView(
			VIEW_TYPE_TIL_DASHBOARD,
			(leaf) => new DashboardView(leaf, this.settings.tilPath)
		);

		this.addCommand({
			id: "open-til-terminal",
			name: "터미널 열기",
			callback: () => {
				this.openTerminal();
			},
		});

		this.addCommand({
			id: "open-til-dashboard",
			name: "학습 대시보드 열기",
			callback: () => {
				this.openDashboard();
			},
		});

		this.addSettingTab(new TILSettingTab(this.app, this));

		// skill 자동 설치 (.claude/skills/ 에 없으면 복사)
		installSkills(this.app.vault);

		// 파일 watcher 시작
		if (this.settings.autoOpenNewTIL) {
			this.watcher = new TILWatcher(this.app, this.settings.tilPath);
			this.watcher.start();
		}

		// MCP 서버 시작
		if (this.settings.mcpEnabled) {
			this.mcpServer = new TILMcpServer(this.app, this.settings.mcpPort, this.settings.tilPath);
			try {
				await this.mcpServer.start();
			} catch {
				// 에러는 TILMcpServer 내부에서 Notice로 표시됨
				this.mcpServer = null;
			}
		}
	}

	async onunload() {
		this.watcher?.stop();
		await this.mcpServer?.stop();
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIL_TERMINAL);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIL_DASHBOARD);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// watcher 상태 동기화
		if (this.settings.autoOpenNewTIL) {
			if (!this.watcher) {
				this.watcher = new TILWatcher(this.app, this.settings.tilPath);
				this.watcher.start();
			} else {
				this.watcher.updatePath(this.settings.tilPath);
			}
		} else {
			this.watcher?.stop();
			this.watcher = null;
		}
	}

	private async openTerminal(): Promise<TerminalView | null> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIL_TERMINAL);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]!);
			return existing[0]!.view as TerminalView;
		}

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: VIEW_TYPE_TIL_TERMINAL,
				active: true,
			});
			await this.app.workspace.revealLeaf(rightLeaf);
			return rightLeaf.view as TerminalView;
		}
		return null;
	}

	private async openDashboard(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIL_DASHBOARD);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]!);
			return;
		}

		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_TIL_DASHBOARD,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}
