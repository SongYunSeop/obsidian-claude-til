import { describe, it, expect } from "vitest";

// Tests the watcher sync logic of saveSettings() in main.ts.
// Replaces TILWatcher with a mock to verify start/stop/updatePath calls.

interface MockWatcher {
	started: boolean;
	stopped: boolean;
	currentPath: string;
	start(): void;
	stop(): void;
	updatePath(path: string): void;
}

function createMockWatcher(tilPath: string): MockWatcher {
	return {
		started: false,
		stopped: false,
		currentPath: tilPath,
		start() {
			this.started = true;
			this.stopped = false;
		},
		stop() {
			this.stopped = true;
			this.started = false;
		},
		updatePath(path: string) {
			this.currentPath = path;
		},
	};
}

// Reproduces the watcher sync logic of saveSettings() in main.ts
function syncWatcher(
	settings: { autoOpenNewTIL: boolean; tilPath: string },
	watcher: MockWatcher | null,
	createWatcher: (path: string) => MockWatcher,
): MockWatcher | null {
	if (settings.autoOpenNewTIL) {
		if (!watcher) {
			const w = createWatcher(settings.tilPath);
			w.start();
			return w;
		} else {
			watcher.updatePath(settings.tilPath);
			return watcher;
		}
	} else {
		watcher?.stop();
		return null;
	}
}

describe("saveSettings watcher sync", () => {
	it("creates and starts a new watcher when autoOpenNewTIL is true and no watcher exists", () => {
		const result = syncWatcher(
			{ autoOpenNewTIL: true, tilPath: "til" },
			null,
			createMockWatcher,
		);

		expect(result).not.toBeNull();
		expect(result!.started).toBe(true);
		expect(result!.currentPath).toBe("til");
	});

	it("only updates path when autoOpenNewTIL is true and watcher already exists", () => {
		const existing = createMockWatcher("til");
		existing.start();

		const result = syncWatcher(
			{ autoOpenNewTIL: true, tilPath: "learning" },
			existing,
			createMockWatcher,
		);

		expect(result).toBe(existing); // same instance
		expect(result!.currentPath).toBe("learning");
		expect(result!.started).toBe(true); // existing state preserved
	});

	it("stops watcher and returns null when autoOpenNewTIL is false", () => {
		const existing = createMockWatcher("til");
		existing.start();

		const result = syncWatcher(
			{ autoOpenNewTIL: false, tilPath: "til" },
			existing,
			createMockWatcher,
		);

		expect(result).toBeNull();
		expect(existing.stopped).toBe(true);
	});

	it("does nothing when autoOpenNewTIL is false and no watcher exists", () => {
		const result = syncWatcher(
			{ autoOpenNewTIL: false, tilPath: "til" },
			null,
			createMockWatcher,
		);

		expect(result).toBeNull();
	});
});

