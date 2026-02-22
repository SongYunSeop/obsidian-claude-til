import { App, PluginSettingTab, Setting, Plugin } from "obsidian";

export interface TILSettings {
	shellPath: string;
	autoLaunchClaude: boolean;
	resumeLastSession: boolean;
	fontSize: number;
	fontFamily: string;
	lineHeight: number;
	tilPath: string;
	autoOpenNewTIL: boolean;
	openDashboardOnStartup: boolean;
	mcpEnabled: boolean;
	mcpPort: number;
}

export const DEFAULT_SETTINGS: TILSettings = {
	shellPath: process.platform === "win32"
		? "powershell.exe"
		: process.env.SHELL || "/bin/zsh",
	autoLaunchClaude: true,
	resumeLastSession: false,
	fontSize: 13,
	fontFamily: 'Menlo, Monaco, "Courier New", monospace',
	lineHeight: 1.0,
	tilPath: "til",
	autoOpenNewTIL: true,
	openDashboardOnStartup: false,
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
			.setName("이전 세션 이어가기")
			.setDesc("터미널 시작 시 마지막 Claude 대화를 이어갑니다 (--continue)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.resumeLastSession)
					.onChange(async (value) => {
						this.plugin.settings.resumeLastSession = value;
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

		new Setting(containerEl)
			.setName("글꼴")
			.setDesc("터미널 글꼴 (시스템에 설치된 폰트만 적용, 변경 후 터미널 재시작 필요)")
			.addDropdown((dropdown) => {
				const presets: Record<string, string> = {
					'Menlo, Monaco, "Courier New", monospace': "Menlo (기본값)",
					'"SF Mono", Menlo, Monaco, monospace': "SF Mono",
					'"Fira Code", "Fira Mono", monospace': "Fira Code",
					'"JetBrains Mono", monospace': "JetBrains Mono",
					'"Source Code Pro", monospace': "Source Code Pro",
					'"Cascadia Code", "Cascadia Mono", monospace': "Cascadia Code",
					'Consolas, "Courier New", monospace': "Consolas",
					'"IBM Plex Mono", monospace': "IBM Plex Mono",
					'"D2Coding", monospace': "D2Coding",
				};
				for (const [value, label] of Object.entries(presets)) {
					dropdown.addOption(value, label);
				}
				const currentValue = this.plugin.settings.fontFamily;
				if (!(currentValue in presets)) {
					dropdown.addOption(currentValue, `커스텀: ${currentValue}`);
				}
				dropdown
					.setValue(currentValue)
					.onChange(async (value) => {
						this.plugin.settings.fontFamily = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("행간")
			.setDesc("터미널 행간 (1.0 = 기본, 1.2 = 넓게)")
			.addSlider((slider) =>
				slider
					.setLimits(1.0, 2.0, 0.1)
					.setValue(this.plugin.settings.lineHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.lineHeight = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "TIL 설정" });

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

		new Setting(containerEl)
			.setName("시작 시 대시보드 열기")
			.setDesc("Obsidian을 열 때 학습 대시보드를 자동으로 표시합니다")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openDashboardOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.openDashboardOnStartup = value;
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
			.setDesc("MCP 서버 포트 (변경 후 플러그인 재시작 필요)")
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
