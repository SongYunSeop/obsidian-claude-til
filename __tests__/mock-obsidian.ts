/**
 * obsidian 모듈 mock.
 * vitest.config.ts의 alias로 import 시 이 파일이 로드된다.
 */

export class TFile {
	path: string;
	name: string;
	extension: string;
	basename: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		const parts = this.name.split(".");
		this.extension = parts.length > 1 ? parts.pop()! : "";
		this.basename = parts.join(".");
	}
}

export class TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[];

	constructor(path: string, children: (TFile | TFolder)[] = []) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		this.children = children;
	}
}

export class Vault {
	private files: Map<string, string> = new Map();
	private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
	private abstractFiles: Map<string, TFile | TFolder> = new Map();

	adapter = {
		exists: async (path: string): Promise<boolean> => {
			return this.files.has(path);
		},
		mkdir: async (_path: string): Promise<void> => {
			// no-op
		},
		write: async (path: string, content: string): Promise<void> => {
			this.files.set(path, content);
		},
		read: async (path: string): Promise<string> => {
			return this.files.get(path) ?? "";
		},
		remove: async (path: string): Promise<void> => {
			this.files.delete(path);
		},
	};

	// 테스트 헬퍼: 파일/폴더 등록
	_setFile(path: string, content: string): void {
		this.files.set(path, content);
		// TFile도 자동 등록
		if (!this.abstractFiles.has(path)) {
			this.abstractFiles.set(path, new TFile(path));
		}
	}

	_setAbstractFile(path: string, file: TFile | TFolder): void {
		this.abstractFiles.set(path, file);
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.abstractFiles.get(path) ?? null;
	}

	getFiles(): TFile[] {
		const result: TFile[] = [];
		for (const [, file] of this.abstractFiles) {
			if (file instanceof TFile) {
				result.push(file);
			}
		}
		return result;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) ?? "";
	}

	on(event: string, callback: (...args: unknown[]) => void): { event: string } {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event)!.push(callback);
		return { event };
	}

	offref(_ref: { event: string }): void {
		// 간단 구현: 리스너 전체 제거
		if (_ref?.event) {
			this.listeners.delete(_ref.event);
		}
	}

	// 테스트 헬퍼: 이벤트 발행
	_trigger(event: string, ...args: unknown[]): void {
		const callbacks = this.listeners.get(event) ?? [];
		for (const cb of callbacks) {
			cb(...args);
		}
	}
}

export class App {
	vault: Vault;
	workspace: {
		getLeaf: () => { openFile: (...args: unknown[]) => void };
		getActiveFile: () => TFile | null;
		openLinkText: (linkText: string, sourcePath: string, newLeaf: boolean) => void;
	};
	metadataCache: {
		getFirstLinkpathDest: (linkpath: string, sourcePath: string) => TFile | null;
	};
	private _activeFile: TFile | null = null;

	constructor(vault?: Vault) {
		this.vault = vault ?? new Vault();
		this.workspace = {
			getLeaf: () => ({
				openFile: () => {},
			}),
			getActiveFile: () => this._activeFile,
			openLinkText: () => {},
		};
		this.metadataCache = {
			getFirstLinkpathDest: (linkpath: string) => {
				// vault에 등록된 파일 중 linkpath와 매치되는 것을 반환
				const files = this.vault.getFiles();
				// 정확한 경로 매치
				const exact = files.find((f) => f.path === linkpath || f.path === linkpath + ".md");
				if (exact) return exact;
				// basename 매치 (Obsidian 기본 동작)
				const byName = files.find((f) => f.basename === linkpath);
				return byName ?? null;
			},
		};
	}

	// 테스트 헬퍼
	_setActiveFile(file: TFile | null): void {
		this._activeFile = file;
	}
}

export class Notice {
	noticeEl: HTMLElement;
	constructor(_message: string | DocumentFragment, _duration?: number) {
		this.noticeEl = {} as HTMLElement;
	}
	hide(): void {}
}

// UI 클래스 스텁 (테스트에서 직접 사용하지 않지만 import 해소용)
export class Modal {
	app: App;
	contentEl = { empty: () => {}, createEl: () => ({}) };
	constructor(app: App) { this.app = app; }
	open(): void {}
	close(): void {}
}

export class Setting {
	constructor(_el: unknown) {}
	setName(_n: string) { return this; }
	setDesc(_d: string) { return this; }
	addText(_cb: unknown) { return this; }
	addDropdown(_cb: unknown) { return this; }
	addButton(_cb: unknown) { return this; }
	addToggle(_cb: unknown) { return this; }
	addSlider(_cb: unknown) { return this; }
}

export class FuzzySuggestModal<T> {
	app: App;
	constructor(app: App) { this.app = app; }
	setPlaceholder(_p: string): void {}
	open(): void {}
	close(): void {}
	getItems(): T[] { return []; }
	getItemText(_item: T): string { return ""; }
	onChooseItem(_item: T): void {}
}

export class Plugin {
	app: App;
	manifest = { version: "0.0.0" };
	constructor() { this.app = new App(); }
	addCommand(_cmd: unknown): void {}
	addSettingTab(_tab: unknown): void {}
	registerView(_type: string, _cb: unknown): void {}
	async loadData(): Promise<unknown> { return {}; }
	async saveData(_data: unknown): Promise<void> {}
}

export class PluginSettingTab {
	app: App;
	containerEl = { empty: () => {}, createEl: () => ({}) };
	constructor(app: App, _plugin: unknown) { this.app = app; }
}

export type EventRef = { event: string };
