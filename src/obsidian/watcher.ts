import { App, TFile, EventRef } from "obsidian";

/**
 * til/ 폴더 아래에 새 .md 파일이 생성되면 에디터에서 자동으로 여는 watcher.
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

			// 약간의 지연 후 열기 (파일 쓰기 완료 대기)
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
