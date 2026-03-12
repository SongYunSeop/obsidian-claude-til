import path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import blessed from "blessed";
import { FsStorage, FsMetadata } from "../adapters/fs-adapter";

interface CardMeta {
	title: string;
	filePath: string;
	frontmatter: Record<string, unknown>;
	body: string;
	question: string;
	answer: string;
	nextReview: Date;
}

interface Stats {
	again: number;
	good: number;
	easy: number;
}

export async function runReviewCommand(basePath: string, tilPath: string): Promise<void> {
	const storage = new FsStorage(basePath);
	const metadata = new FsMetadata(basePath, storage);
	const files = await storage.listFiles();
	const tilFiles = files.filter((f) => f.extension === "md" && f.path.startsWith(`${tilPath}/`));
	const cards: CardMeta[] = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	for (const file of tilFiles) {
		const content = await storage.readFile(file.path);
		if (!content) continue;
		const fm = await metadata.getFileMetadata(file.path);
		const frontmatter = fm?.frontmatter ?? {};
		const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string") : [];
		if (!tags.includes("til")) continue;

		const cardsInFile = parseCards(content);
		if (cardsInFile.length === 0) continue;

		const nextReview = parseNextReview(frontmatter);
		if (nextReview > today) continue;

		const title = determineTitle(frontmatter, fm?.headings, file.name);

		for (const { question, answer } of cardsInFile) {
			cards.push({
				title,
				filePath: file.path,
				frontmatter: { ...frontmatter },
				body: stripFrontmatter(content),
				question,
				answer,
				nextReview,
			});
		}
	}

	if (cards.length === 0) {
		console.log("복습할 카드가 없습니다. 다음에 다시 와주세요!");
		return;
	}

	cards.sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime());

	const screen = blessed.screen({
		smartCSR: true,
		title: "oh-my-til review",
	});
	const questionBox = blessed.box({
		top: 0,
		height: "60%",
		left: 0,
		right: 0,
		border: "line",
		label: "Review",
		padding: { left: 1, right: 1 },
	});
	const statusBox = blessed.box({
		height: 3,
		bottom: 0,
		left: 0,
		right: 0,
		border: "line",
		padding: { left: 1, right: 1 },
	});
	screen.append(questionBox);
	screen.append(statusBox);

	const stats: Stats = { again: 0, good: 0, easy: 0 };
	let currentIndex = 0;
	let showAnswer = false;
	let finished = false;

	function renderCard() {
		const card = cards[currentIndex];
		let content = `Title: ${card.title}\nFile: ${card.filePath}\nNext: ${formatDate(card.nextReview)}\n\nQ: ${card.question}`;
		if (showAnswer) {
			content += `\n\nA: ${card.answer}`;
		}
		questionBox.setContent(content);
		statusBox.setContent(
			`CARD ${currentIndex + 1}/${cards.length} | Again:${stats.again} Good:${stats.good} Easy:${stats.easy} | [Space] 답 보기  [1/2/3] 평가  [q] 종료`,
		);
		screen.render();
	}

	async function handleGrade(grade: 1 | 2 | 3) {
		if (!showAnswer || finished) return;
		const card = cards[currentIndex];
		const update = computeSm2(card.frontmatter, grade);
		await persistFrontmatter(storage, card.filePath, card.frontmatter, update);
		Object.assign(card.frontmatter, update);
		if (grade === 1) stats.again++;
		else if (grade === 2) stats.good++;
		else stats.easy++;
		showAnswer = false;
		currentIndex++;
		if (currentIndex >= cards.length) {
			finished = true;
			questionBox.setContent("모든 카드를 복습했습니다. [q] 또는 [Ctrl+C]로 종료하세요.");
			statusBox.setContent(`완료! ${stats.again} Again / ${stats.good} Good / ${stats.easy} Easy`);
			screen.render();
			return;
		}
		renderCard();
	}

	screen.key(["space"], () => {
		if (finished) return;
		showAnswer = true;
		renderCard();
	});
	screen.key(["1"], () => handleGrade(1));
	screen.key(["2"], () => handleGrade(2));
	screen.key(["3"], () => handleGrade(3));
	screen.key(["q", "C-c"], () => {
		screen.destroy();
		process.exit(0);
	});

	renderCard();
}

function parseCards(content: string): Array<{ question: string; answer: string }> {
	const match = content.match(/<!--\s*omt-cards\s*-->([\s\S]*?)<!--\s*\/omt-cards\s*-->/i);
	if (!match) return [];
	const block = match[1];
	const regex = /\*\*Q:\*\*\s*([^\n]+)\s*\n\*\*A:\*\*\s*([\s\S]+?)(?=(?:\*\*Q:\*\*|$))/g;
	const cards: Array<{ question: string; answer: string }> = [];
	let found;
	while ((found = regex.exec(block)) !== null) {
		cards.push({ question: found[1].trim(), answer: found[2].trim() });
	}
	return cards;
}

function parseNextReview(frontmatter: Record<string, unknown>): Date {
	const raw = frontmatter.next_review;
	if (typeof raw === "string") {
		const date = new Date(raw);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
	}
	return new Date(0);
}

function determineTitle(frontmatter: Record<string, unknown>, headings: string[] | undefined, fileName: string): string {
	if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
		return frontmatter.title;
	}
	if (headings && headings.length > 0) {
		return headings[0];
	}
	return path.basename(fileName, path.extname(fileName));
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith("---")) return content;
	const end = content.indexOf("---", 3);
	return end === -1 ? content : content.slice(end + 3).trimStart();
}

function formatDate(date: Date): string {
	if (isNaN(date.getTime())) return "정해짐";
	return date.toISOString().slice(0, 10);
}

function computeSm2(frontmatter: Record<string, unknown>, grade: 1 | 2 | 3): Record<string, unknown> {
	const quality = grade === 1 ? 3 : grade === 2 ? 4 : 5;
	let interval = typeof frontmatter.interval === "number" ? frontmatter.interval : 0;
	let ef = typeof frontmatter.ef === "number" ? frontmatter.ef : 2.5;
	let repetitions = typeof frontmatter.repetitions === "number" ? frontmatter.repetitions : 0;
	if (quality < 3) {
		repetitions = 0;
		interval = 1;
	} else {
		if (repetitions === 0) {
			interval = 1;
		} else if (repetitions === 1) {
			interval = 6;
		} else {
			interval = Math.round(interval * ef);
		}
		repetitions++;
	}
	ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
	const nextReview = new Date();
	nextReview.setHours(0, 0, 0, 0);
	nextReview.setDate(nextReview.getDate() + interval);
	return {
		next_review: formatDate(nextReview),
		interval,
		ef: Number(ef.toFixed(2)),
		repetitions,
		last_review: formatDate(new Date()),
	};
}

async function persistFrontmatter(
	storage: FsStorage,
	filePath: string,
	current: Record<string, unknown>,
	updates: Record<string, unknown>,
) {
	const content = await storage.readFile(filePath);
	if (!content) return;
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	const body = match ? match[2] : content;
	const combined = { ...current, ...updates };
	const serialized = stringifyYaml(combined).trim();
	const newContent = `---\n${serialized}\n---\n${body}`;
	await storage.writeFile(filePath, newContent);
}
