import { describe, it, expect } from "vitest";
import { handleShiftEnter } from "../src/core/keyboard";

describe("handleShiftEnter", () => {
	it("Shift+Enter keydown → send newline, block default behavior", () => {
		const result = handleShiftEnter({ key: "Enter", shiftKey: true, type: "keydown" });
		expect(result.sendNewline).toBe(true);
		expect(result.allowDefault).toBe(false);
	});

	it("Shift+Enter keypress → do not send newline, block default behavior", () => {
		const result = handleShiftEnter({ key: "Enter", shiftKey: true, type: "keypress" });
		expect(result.sendNewline).toBe(false);
		expect(result.allowDefault).toBe(false);
	});

	it("Shift+Enter keyup → do not send newline, block default behavior", () => {
		const result = handleShiftEnter({ key: "Enter", shiftKey: true, type: "keyup" });
		expect(result.sendNewline).toBe(false);
		expect(result.allowDefault).toBe(false);
	});

	it("Enter (no Shift) → allow default behavior", () => {
		const result = handleShiftEnter({ key: "Enter", shiftKey: false, type: "keydown" });
		expect(result.sendNewline).toBe(false);
		expect(result.allowDefault).toBe(true);
	});

	it("other key → allow default behavior", () => {
		const result = handleShiftEnter({ key: "a", shiftKey: true, type: "keydown" });
		expect(result.sendNewline).toBe(false);
		expect(result.allowDefault).toBe(true);
	});
});
