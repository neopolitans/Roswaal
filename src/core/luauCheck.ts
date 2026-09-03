/**
 * A cheap structural check for hand-written Luau.
 *
 * Custom Code and Luau Expression nodes are inserted into the output verbatim,
 * which means a stray `end` or an unclosed string does not break the node — it
 * breaks the whole generated file, somewhere else, with an error that points
 * at a line the developer did not write.
 *
 * This is not a parser and does not pretend to be. It balances brackets,
 * strings, comments and the block keywords, which is what actually goes wrong
 * when you paste code into a small box. Anything subtler is Luau's own job.
 */

export interface BalanceProblem {
	message: string;
	line: number;
	/** Character offsets into the source, so an editor can underline it. */
	from: number;
	to: number;
}

/** Keywords that open a block, and the count each contributes. */
const OPENERS = new Set(["function", "do", "then", "repeat"]);
const CLOSERS = new Set(["end", "until"]);

export function checkLuauBalance(source: string): BalanceProblem[] {
	const problems: BalanceProblem[] = [];
	const brackets: { char: string; line: number; at: number }[] = [];

	/** Marks a span, clamped so an empty range still shows a caret. */
	const span = (start: number, end: number) => ({
		from: Math.max(0, start),
		to: Math.max(start + 1, Math.min(end, source.length)),
	});
	/** Open block keywords, so an unclosed one can be reported where it is. */
	const blocks: { word: string; line: number; at: number }[] = [];
	let pendingElseif = false;
	let line = 1;
	let i = 0;

	const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

	while (i < source.length) {
		const c = source[i];

		if (c === "\n") {
			line++;
			i++;
			continue;
		}

		// Comments. A long comment is skipped whole; a line comment to the end.
		if (c === "-" && source[i + 1] === "-") {
			const start = i;
			i += 2;
			if (source[i] === "[" && source[i + 1] === "[") {
				i += 2;
				while (i < source.length && !(source[i] === "]" && source[i + 1] === "]")) {
					if (source[i] === "\n") line++;
					i++;
				}
				if (i >= source.length) {
					problems.push({
						message: "This block comment is never closed.",
						line,
						...span(start, source.length),
					});
					return problems;
				}
				i += 2;
			} else {
				while (i < source.length && source[i] !== "\n") i++;
			}
			continue;
		}

		// Long strings share the bracket syntax but are not brackets.
		if (c === "[" && source[i + 1] === "[") {
			const startLine = line;
			const start = i;
			i += 2;
			while (i < source.length && !(source[i] === "]" && source[i + 1] === "]")) {
				if (source[i] === "\n") line++;
				i++;
			}
			if (i >= source.length) {
				problems.push({
					message: "This long string is never closed.",
					line: startLine,
					...span(start, source.length),
				});
				return problems;
			}
			i += 2;
			continue;
		}

		if (c === '"' || c === "'") {
			const startLine = line;
			const start = i;
			i++;
			let closed = false;
			while (i < source.length) {
				if (source[i] === "\\") {
					i += 2;
					continue;
				}
				if (source[i] === "\n") break;
				if (source[i] === c) {
					closed = true;
					i++;
					break;
				}
				i++;
			}
			if (!closed) {
				problems.push({
					message: "This string is never closed.",
					line: startLine,
					...span(start, i),
				});
				return problems;
			}
			continue;
		}

		if (c === "(" || c === "[" || c === "{") {
			brackets.push({ char: c, line, at: i });
			i++;
			continue;
		}
		if (c === ")" || c === "]" || c === "}") {
			const open = brackets.pop();
			if (!open) {
				problems.push({
					message: `There is a "${c}" with nothing it closes.`,
					line,
					...span(i, i + 1),
				});
			} else if (open.char !== pairs[c]) {
				problems.push({
					message: `A "${open.char}" opened on line ${open.line} is closed by "${c}".`,
					line,
					...span(i, i + 1),
				});
			}
			i++;
			continue;
		}

		if (/[A-Za-z_]/.test(c)) {
			const start = i;
			while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
			const word = source.slice(start, i);

			// `elseif ... then` continues the block `if ... then` already opened,
			// so its `then` must not open a second one.
			if (word === "elseif") {
				pendingElseif = true;
				continue;
			}
			if (word === "then" && pendingElseif) {
				pendingElseif = false;
				continue;
			}
			if (OPENERS.has(word)) {
				blocks.push({ word, line, at: start });
			} else if (CLOSERS.has(word)) {
				if (blocks.length === 0) {
					problems.push({
						message: `There is an "${word}" with no matching block.`,
						line,
						...span(start, i),
					});
				} else {
					blocks.pop();
				}
			}
			continue;
		}

		i++;
	}

	for (const open of brackets) {
		problems.push({
			message: `A "${open.char}" is never closed.`,
			line: open.line,
			...span(open.at, open.at + 1),
		});
	}
	// Reported at the keyword that opened the block, not at the end of the
	// file. "This `if` is never closed" is a place you can go and look at.
	for (const open of blocks) {
		const closer = open.word === "repeat" ? "until" : "end";
		problems.push({
			message: `This "${open.word}" is never closed with "${closer}".`,
			line: open.line,
			...span(open.at, open.at + open.word.length),
		});
	}
	return problems;
}
