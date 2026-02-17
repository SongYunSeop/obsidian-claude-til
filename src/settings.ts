import { App, PluginSettingTab, Setting, Plugin } from "obsidian";

export interface TILSettings {
	shellPath: string;
	autoLaunchClaude: boolean;
	fontSize: number;
	tilPath: string;
	autoOpenNewTIL: boolean;
	mcpEnabled: boolean;
	mcpPort: number;
}

export const DEFAULT_SETTINGS: TILSettings = {
	shellPath: process.platform === "win32"
		? "powershell.exe"
		: process.env.SHELL || "/bin/zsh",
	autoLaunchClaude: true,
	fontSize: 13,
	tilPath: "til",
	autoOpenNewTIL: true,
	mcpEnabled: true,
	mcpPort: 22360,
};

export class TILSettingTab extends PluginSettingTab {
	private plugin: Plugin & { settings: TILSettings; saveSettings(): Promise<void> };

	constructor(app: App, plugin: Plugin & { settings: TILSettings; saveSettings(): Promise<void> }) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Shell 경로")
			.setDesc("터미널에서 사용할 셸 실행 파일 경로")
			.addText((text) =>
				text
					.setPlaceholder("/bin/zsh")
					.setValue(this.plugin.settings.shellPath)
					.onChange(async (value) => {
						this.plugin.settings.shellPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Claude 자동 실행")
			.setDesc("터미널이 열릴 때 자동으로 'claude' 명령을 실행합니다")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoLaunchClaude)
					.onChange(async (value) => {
						this.plugin.settings.autoLaunchClaude = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("글꼴 크기")
			.setDesc("터미널 글꼴 크기 (px)")
			.addSlider((slider) =>
				slider
					.setLimits(10, 24, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fontSize = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "TIL 설정" });

		new Setting(containerEl)
			.setName("TIL 폴더 경로")
			.setDesc("TIL 파일이 저장되는 폴더 (vault 루트 기준)")
			.addText((text) =>
				text
					.setPlaceholder("til")
					.setValue(this.plugin.settings.tilPath)
					.onChange(async (value) => {
						this.plugin.settings.tilPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("새 TIL 파일 자동 열기")
			.setDesc("til/ 폴더에 새 .md 파일이 생성되면 에디터에서 자동으로 엽니다")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoOpenNewTIL)
					.onChange(async (value) => {
						this.plugin.settings.autoOpenNewTIL = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "MCP 서버" });

		new Setting(containerEl)
			.setName("MCP 서버 활성화")
			.setDesc("Claude Code가 vault에 직접 접근할 수 있는 MCP 서버를 실행합니다")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.mcpEnabled)
					.onChange(async (value) => {
						this.plugin.settings.mcpEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("MCP 포트")
			.setDesc("WebSocket 서버 포트 (변경 후 플러그인 재시작 필요)")
			.addText((text) =>
				text
					.setPlaceholder("22360")
					.setValue(String(this.plugin.settings.mcpPort))
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.mcpPort = port;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
