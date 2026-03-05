/**
 * obsidian module mock.
 * This file is loaded when imported via the alias in vitest.config.ts.
 */

export class TFile {
	path: string;
	name: string;
	extension: string;
	basename: string;
	stat: { ctime: number; mtime: number; size: number };

	constructor(path: string, stat?: { ctime?: number; mtime?: number; size?: number }) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		const parts = this.name.split(".");
		this.extension = parts.length > 1 ? parts.pop()! : "";
		this.basename = parts.join(".");
		this.stat = { ctime: stat?.ctime ?? 0, mtime: stat?.mtime ?? 0, size: stat?.size ?? 0 };
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

	// Test helper: register file/folder
	_setFile(path: string, content: string, stat?: { ctime?: number; mtime?: number; size?: number }): void {
		this.files.set(path, content);
		// Also auto-register TFile (update if stat is provided)
		if (!this.abstractFiles.has(path) || stat) {
			this.abstractFiles.set(path, new TFile(path, stat));
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
		// Simple implementation: remove all listeners
		if (_ref?.event) {
			this.listeners.delete(_ref.event);
		}
	}

	// Test helper: trigger event
	_trigger(event: string, ...args: unknown[]): void {
		const callbacks = this.listeners.get(event) ?? [];
		for (const cb of callbacks) {
			cb(...args);
		}
	}
}

export interface CachedMetadata {
	headings?: Array<{ heading: string; level: number }>;
	links?: Array<{ link: string; displayText?: string }>;
	tags?: Array<{ tag: string }>;
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
		getFileCache: (file: TFile) => CachedMetadata | null;
		resolvedLinks: Record<string, Record<string, number>>;
		unresolvedLinks: Record<string, Record<string, number>>;
	};
	private _activeFile: TFile | null = null;
	private _fileCacheMap: Map<string, CachedMetadata> = new Map();

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
				// Return the file registered in vault that matches linkpath
				const files = this.vault.getFiles();
				// Exact path match
				const exact = files.find((f) => f.path === linkpath || f.path === linkpath + ".md");
				if (exact) return exact;
				// basename match (Obsidian default behavior)
				const byName = files.find((f) => f.basename === linkpath);
				return byName ?? null;
			},
			getFileCache: (file: TFile) => {
				return this._fileCacheMap.get(file.path) ?? null;
			},
			resolvedLinks: {},
			unresolvedLinks: {},
		};
	}

	// Test helpers
	_setActiveFile(file: TFile | null): void {
		this._activeFile = file;
	}

	_setFileCache(path: string, cache: CachedMetadata): void {
		this._fileCacheMap.set(path, cache);
	}

	_setResolvedLinks(links: Record<string, Record<string, number>>): void {
		this.metadataCache.resolvedLinks = links;
	}

	_setUnresolvedLinks(links: Record<string, Record<string, number>>): void {
		this.metadataCache.unresolvedLinks = links;
	}
}

export class Notice {
	noticeEl: HTMLElement;
	constructor(_message: string | DocumentFragment, _duration?: number) {
		this.noticeEl = {} as HTMLElement;
	}
	hide(): void {}
}

// UI class stubs (not used directly in tests, but needed to resolve imports)
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
