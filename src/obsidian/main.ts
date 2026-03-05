import { Plugin, Notice, TFile } from "obsidian";
import { TerminalView, VIEW_TYPE_TIL_TERMINAL } from "./terminal/TerminalView";
import { DashboardView, VIEW_TYPE_TIL_DASHBOARD } from "./dashboard/DashboardView";
import { TILSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { TILSettings } from "./settings";
import { TILWatcher } from "./watcher";
import { installPlugin } from "../plugin-install";
import { parseBacklogItems, extractTopicFromPath } from "../core/backlog";
import { ObsidianStorage } from "../adapters/obsidian-adapter";

export default class TILPlugin extends Plugin {
	settings: TILSettings = DEFAULT_SETTINGS;
	private watcher: TILWatcher | null = null;

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
			name: "Open Terminal",
			callback: () => {
				this.openTerminal();
			},
		});

		this.addCommand({
			id: "open-til-dashboard",
			name: "Open Learning Dashboard",
			callback: () => {
				this.openDashboard();
			},
		});

		this.addSettingTab(new TILSettingTab(this.app, this));

		// Auto-install/update plugin assets (skills, agents, CLAUDE.md)
		const storage = new ObsidianStorage(this.app);
		installPlugin(storage, this.manifest.version);

		// Auto-open dashboard on startup (acquire focus after workspace restore)
		if (this.settings.openDashboardOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				setTimeout(() => this.openDashboard(), 500);
			});
		}

		// Start file watcher
		if (this.settings.autoOpenNewTIL) {
			this.watcher = new TILWatcher(this.app, this.settings.tilPath);
			this.watcher.start();
		}

		// backlog → TIL nudge: check for backlog match when an empty file is opened
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (!file || !(file instanceof TFile)) return;

				const tilPath = this.settings.tilPath;
				if (!file.path.startsWith(tilPath + "/")) return;
				if (file.name === "backlog.md") return;

				const content = await this.app.vault.read(file);
				if (content.trim() !== "") return;

				const info = extractTopicFromPath(file.path, tilPath);
				if (!info) return;

				const backlogFiles = this.app.vault.getFiles().filter(
					(f) => f.path.startsWith(tilPath + "/") && f.name === "backlog.md",
				);

				const filePathWithoutExt = file.path.endsWith(".md")
					? file.path.slice(0, -3)
					: file.path;

				for (const backlogFile of backlogFiles) {
					const backlogContent = await this.app.vault.read(backlogFile);
					const items = parseBacklogItems(backlogContent);
					const matched = items.find((item) => item.path === filePathWithoutExt);

					if (matched) {
						const { displayName } = matched;
						const { category } = info;
						const notice = new Notice("", 0);
						notice.noticeEl.empty();
						notice.noticeEl.createEl("span", {
							text: `"${displayName}" is in your backlog.`,
						});
						const btnContainer = notice.noticeEl.createDiv({
							cls: "notice-actions",
						});
						btnContainer.style.display = "flex";
						btnContainer.style.gap = "8px";
						btnContainer.style.marginTop = "8px";
						const startBtn = btnContainer.createEl("button", {
							text: "Start",
							cls: "mod-cta",
						});
						startBtn.addEventListener("click", async () => {
							notice.hide();
							const terminalView = await this.openTerminal();
							if (terminalView) {
								const escapedName = displayName.replace(/"/g, '\\"');
								const escapedCategory = category.replace(/"/g, '\\"');
								terminalView.writeCommand(
									`/til "${escapedName}" "${escapedCategory}"`,
								);
								terminalView.focusTerminal();
							}
						});
						const laterBtn = btnContainer.createEl("button", {
							text: "Later",
						});
						laterBtn.addEventListener("click", () => {
							notice.hide();
						});
						return;
					}
				}
			}),
		);

	}

	async onunload() {
		this.watcher?.stop();
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIL_TERMINAL);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIL_DASHBOARD);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Sync watcher state
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
