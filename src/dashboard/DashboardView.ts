import { ItemView, WorkspaceLeaf } from "obsidian";
import { computeStats, type TILStats } from "./stats";

export const VIEW_TYPE_TIL_DASHBOARD = "claude-til-dashboard-view";

export class DashboardView extends ItemView {
	private tilPath: string;

	constructor(leaf: WorkspaceLeaf, tilPath: string) {
		super(leaf);
		this.tilPath = tilPath;
	}

	getViewType(): string {
		return VIEW_TYPE_TIL_DASHBOARD;
	}

	getDisplayText(): string {
		return "TIL Dashboard";
	}

	getIcon(): string {
		return "bar-chart-2";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		// cleanup 불필요
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass("claude-til-dashboard");

		const stats = await computeStats(this.app, this.tilPath);
		this.renderHeader(container as HTMLElement, stats);
		this.renderCategories(container as HTMLElement, stats);
	}

	private renderHeader(container: HTMLElement, stats: TILStats): void {
		const header = container.createDiv({ cls: "claude-til-dashboard-header" });
		header.createEl("h2", { text: "TIL Dashboard" });

		const summaryCard = header.createDiv({ cls: "claude-til-dashboard-card" });
		summaryCard.createDiv({ cls: "claude-til-dashboard-card-value", text: String(stats.totalTils) });
		summaryCard.createDiv({ cls: "claude-til-dashboard-card-label", text: "Total TILs" });
	}

	private renderCategories(container: HTMLElement, stats: TILStats): void {
		if (stats.categories.length === 0) {
			container.createDiv({
				cls: "claude-til-dashboard-empty",
				text: "TIL 파일이 없습니다. 터미널에서 /til 스킬을 실행해보세요.",
			});
			return;
		}

		const section = container.createDiv({ cls: "claude-til-dashboard-section" });
		section.createEl("h3", { text: "Categories" });

		const list = section.createDiv({ cls: "claude-til-dashboard-categories" });
		for (const cat of stats.categories) {
			const row = list.createDiv({ cls: "claude-til-dashboard-category-row" });
			row.createSpan({ cls: "claude-til-dashboard-category-name", text: cat.name });
			row.createSpan({ cls: "claude-til-dashboard-category-count", text: String(cat.count) });

			// 간단한 비율 바
			const barContainer = row.createDiv({ cls: "claude-til-dashboard-bar-container" });
			const bar = barContainer.createDiv({ cls: "claude-til-dashboard-bar" });
			const pct = stats.totalTils > 0 ? (cat.count / stats.totalTils) * 100 : 0;
			bar.style.width = `${pct}%`;
		}
	}
}
