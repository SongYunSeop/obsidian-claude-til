/**
 * Shift+Enter 키 이벤트 핸들러.
 * xterm.js는 Shift+Enter와 Enter 모두 \r을 전송하지만,
 * Claude Code는 \r(submit)과 \n(newline)을 구분한다.
 * Shift+Enter의 모든 이벤트를 차단하고, keydown에서만 \n 전송을 지시한다.
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
