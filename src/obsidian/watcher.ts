import { App, TFile, EventRef } from "obsidian";

/**
 * Watches for new .md files created under the til/ folder and auto-opens them in the editor.
 */
export class TILWatcher {
	private app: App;
	private tilPath: string;
	private eventRef: EventRef | null = null;

	constructor(app: App, tilPath: string) {
		this.app = app;
		this.tilPath = tilPath;
	}

	start(): void {
		this.eventRef = this.app.vault.on("create", (file) => {
			if (!(file instanceof TFile)) return;
			if (!file.path.startsWith(this.tilPath + "/")) return;
			if (file.extension !== "md") return;

			// Delay slightly to wait for file write to complete
			setTimeout(() => {
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(file);
			}, 200);
		});
	}

	stop(): void {
		if (this.eventRef) {
			this.app.vault.offref(this.eventRef);
			this.eventRef = null;
		}
	}

	updatePath(tilPath: string): void {
		this.tilPath = tilPath;
	}
}
