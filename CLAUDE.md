# CLAUDE.md - obsidian-claude-til

## 프로젝트 개요

Obsidian 플러그인. 사이드바에 Claude Code 터미널을 임베딩하여 TIL 학습 워크플로우를 Obsidian 안에서 실행한다. xterm.js + node-pty 기반.

핵심 흐름: 커맨드 팔레트 → 터미널 열기 → Claude Code에서 `/til`, `/backlog`, `/research`, `/save` 스킬 직접 실행 → 새 파일 감지 시 에디터에서 열기

Obsidian의 역할은 "터미널 임베딩 + 파일 감시 + skill 배포 + MCP 서버 + 대시보드"로 한정하고, 워크플로우 주도권은 Claude Code에 있다.

## 기술 스택

- TypeScript + Obsidian Plugin API
- xterm.js (@xterm/xterm) — 터미널 렌더링
- node-pty — PTY(의사 터미널) 프로세스 관리
- @modelcontextprotocol/sdk — MCP 프로토콜 구현
- zod — 입력 스키마 검증 (MCP SDK 피어)
- @electron/rebuild — 네이티브 모듈 재빌드 (Electron 37.10.2)
- esbuild — 번들러

## 핵심 레퍼런스

- [claude-code-terminal](https://github.com/dternyak/claude-code-terminal) — xterm.js + node-pty Obsidian 통합 패턴의 원본 구현

## 구조

```
src/
├── main.ts               ← TILPlugin 진입점 (터미널 뷰 + MCP + 대시보드 + watcher + skill 설치)
├── settings.ts           ← 설정 탭 + 인터페이스 (mcpEnabled, mcpPort 포함)
├── skills.ts             ← Skill/Rule 버전 기반 자동 설치/업데이트 + CLAUDE.md MCP 섹션 관리
├── watcher.ts            ← 새 TIL 파일 감지 → 에디터에서 열기
├── backlog.ts            ← 백로그 파싱 순수 함수 (parseBacklogItems, extractTopicFromPath)
├── terminal/
│   ├── TerminalView.ts       ← 사이드바 터미널 (ItemView + xterm.js)
│   ├── WikilinkProvider.ts   ← [[위키링크]] 감지 + CJK 셀 너비 + 클릭 시 노트 열기 (ILinkProvider)
│   └── pty.ts                ← PTY 프로세스 관리 (node-pty)
├── mcp/
│   ├── server.ts         ← MCP 서버 라이프사이클 (HTTP + Streamable HTTP 트랜스포트)
│   ├── tools.ts          ← MCP 도구 정의 (vault 접근)
│   └── context.ts        ← 학습 컨텍스트 순수 함수 (topic 매칭, 최근 활동, 포맷)
└── dashboard/
    ├── DashboardView.ts  ← 학습 대시보드 (ItemView)
    └── stats.ts          ← vault 파싱 → TIL 통계 계산

rules/
└── save-rules.md         ← /save 스킬 규칙 (esbuild text import → vault에 설치)

__tests__/
├── mock-obsidian.ts      ← obsidian 모듈 mock
├── utils.test.ts         ← 설정 기본값 테스트
├── skills.test.ts        ← skill/rule 버전 기반 설치/업데이트 로직 테스트
├── watcher.test.ts       ← 파일 감시 필터링 로직 테스트
├── stats.test.ts         ← 통계 계산 로직 테스트
├── mcp-tools.test.ts     ← MCP 도구 필터링/집계 로직 테스트
├── context.test.ts       ← 학습 컨텍스트 순수 함수 테스트
├── mcp-server.test.ts    ← MCP 서버 HTTP 라우팅/CORS/라이프사이클 테스트
├── main-logic.test.ts    ← 플러그인 핵심 로직 (watcher 동기화, 설정 검증)
├── backlog.test.ts       ← 백로그 파싱/경로 추출 테스트
└── wikilink-provider.test.ts ← 위키링크 감지 + CJK 셀 너비 순수 함수 테스트
```

## 빌드

```bash
npm install
npm run rebuild-pty    # node-pty를 Obsidian Electron 버전에 맞춰 재빌드
npm run dev            # 워치 모드
npm run build          # 프로덕션 빌드
npm test               # vitest 테스트 실행
npm run deploy -- <vault-path>  # vault에 배포 (빌드 + 복사 + pty 재빌드)
npm run deploy -- --refresh-skills <vault-path>  # 스킬/규칙 강제 재설치 포함
```

## 규칙

- Obsidian API는 `obsidian` 모듈에서 import
- node-pty는 `electronRequire`로 로드 (일반 import 불가, 네이티브 모듈)
- `onload()`에서 등록한 리소스는 자동 해제됨
- `onunload()`에서 PTY 프로세스를 반드시 kill
- 파일 감시는 `vault.on('create', ...)` 사용
- manifest.json의 `isDesktopOnly`는 반드시 `true` (node-pty 네이티브 모듈 때문)
- esbuild에서 node-pty는 external로 처리
- UI 워크플로우(주제 입력, 백로그 선택)는 Claude Code 스킬이 담당 — Obsidian 쪽에서 중복 구현하지 않는다
- MCP 도구는 Obsidian `App` 인스턴스를 통해 vault 접근 — node-pty/터미널을 거치지 않음
- MCP 서버는 `onload()`에서 시작, `onunload()`에서 종료
- 대시보드는 순수 DOM 조작 (프레임워크 없음), Obsidian CSS 변수 활용
- 코드 변경 시 테스트 가능한 부분은 반드시 테스트 작성/실행 후 커밋 (`npm test && npm run build` 통과 확인)
- Skill 파일은 `.claude/skills/<name>/SKILL.md` 경로에 설치 (Claude Code가 1단계 깊이만 탐색, 중첩 불가)
- Skill 파일의 `plugin-version` frontmatter로 자동 업데이트 관리. 없으면 사용자 커스터마이즈로 간주하여 덮어쓰지 않음
- 백로그 파일은 `til/{카테고리}/backlog.md` 경로 패턴
- 한국어 작성, 기술 용어 원어 병기
- **문서 동기화**: 새 파일 추가, 설정 변경, 스킬 추가/삭제 등 구조적 변경이 있으면 `CLAUDE.md`, `README.md`, `README.ko.md`도 함께 업데이트한다 (구조 섹션, 기능 목록, 설정 테이블, 스킬 목록)
- **버전 업데이트 체크리스트**: 기능 추가/스킬 변경 시 아래 6개 파일의 버전을 반드시 동기화:
  1. `package.json` → `"version"`
  2. `manifest.json` → `"version"`
  3. `skills/til/SKILL.md` → `plugin-version` frontmatter
  4. `skills/backlog/SKILL.md` → `plugin-version` frontmatter
  5. `skills/research/SKILL.md` → `plugin-version` frontmatter
  6. `skills/save/SKILL.md` → `plugin-version` frontmatter

## 참고 문서

- [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- [Plugin API Reference](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [xterm.js docs](https://xtermjs.org/docs/)
- [node-pty (GitHub)](https://github.com/microsoft/node-pty)
- [claude-code-terminal 소스](https://github.com/dternyak/claude-code-terminal)
