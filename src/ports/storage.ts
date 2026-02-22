/**
 * 플랫폼 독립적인 파일 스토리지 인터페이스.
 * Obsidian Vault, node:fs, 또는 다른 백엔드로 구현 가능하다.
 */

export interface FileEntry {
	path: string;
	/** 확장자 (마침표 없이, 예: "md") */
	extension: string;
	/** 파일명 (확장자 포함, 예: "generics.md") */
	name: string;
	/** 마지막 수정 시각 (ms timestamp) */
	mtime: number;
	/** 생성 시각 (ms timestamp) */
	ctime: number;
}

export interface FileStorage {
	/** 파일 내용을 읽는다. 파일이 없으면 null을 반환한다. */
	readFile(path: string): Promise<string | null>;

	/** 모든 파일 목록을 반환한다. */
	listFiles(): Promise<FileEntry[]>;

	/** 파일 존재 여부를 확인한다. */
	exists(path: string): Promise<boolean>;

	/** 파일을 쓴다. 디렉토리가 없으면 자동 생성한다. */
	writeFile(path: string, content: string): Promise<void>;

	/** 디렉토리를 생성한다. */
	mkdir(path: string): Promise<void>;

	/** 파일을 삭제한다. */
	remove(path: string): Promise<void>;

	/** 베이스 경로(vault root)를 반환한다. */
	getBasePath(): string;
}
