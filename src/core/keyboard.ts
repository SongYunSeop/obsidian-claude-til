/**
 * Shift+Enter key event handler.
 * xterm.js sends \r for both Shift+Enter and Enter,
 * but Claude Code distinguishes \r (submit) from \n (newline).
 * Blocks all Shift+Enter events and signals \n send only on keydown.
 */
export function handleShiftEnter(e: Pick<KeyboardEvent, "key" | "shiftKey" | "type">): {
	sendNewline: boolean;
	allowDefault: boolean;
} {
	if (e.key === "Enter" && e.shiftKey) {
		return { sendNewline: e.type === "keydown", allowDefault: false };
	}
	return { sendNewline: false, allowDefault: true };
}
