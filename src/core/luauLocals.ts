/**
 * Finding the locals a block of hand-written Luau declares.
 *
 * Custom Code is emitted verbatim, so a `local` inside one is a real local in
 * the generated file and is visible to everything that follows it in the same
 * block. Nothing else in Roswaal knows that, which is why a later Custom Code
 * node could not offer you a name an earlier one had just introduced.
 *
 * Like the balance checker, this scans rather than parses. It handles the two
 * forms that actually appear — `local a, b = ...` and `local function f()` —
 * and skips strings and comments so a `local` inside one is not mistaken for a
 * declaration. It does not attempt block scoping within the snippet; a name
 * declared inside an `if` here will be offered outside it, which errs towards
 * suggesting a little too much rather than too little.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function collectLocalNames(source: string): string[] {
	const names: string[] = [];
	const seen = new Set<string>();
	let i = 0;

	const add = (name: string) => {
		if (!IDENTIFIER.test(name) || seen.has(name)) return;
		seen.add(name);
		names.push(name);
	};

	while (i < source.length) {
		const c = source[i];

		// Comments, long and short.
		if (c === "-" && source[i + 1] === "-") {
			i += 2;
			if (source[i] === "[" && source[i + 1] === "[") {
				const close = source.indexOf("]]", i + 2);
				i = close === -1 ? source.length : close + 2;
			} else {
				const newline = source.indexOf("\n", i);
				i = newline === -1 ? source.length : newline;
			}
			continue;
		}

		// Long strings.
		if (c === "[" && source[i + 1] === "[") {
			const close = source.indexOf("]]", i + 2);
			i = close === -1 ? source.length : close + 2;
			continue;
		}

		if (c === '"' || c === "'") {
			i++;
			while (i < source.length && source[i] !== c) {
				i += source[i] === "\\" ? 2 : 1;
			}
			i++;
			continue;
		}

		if (c === "`") {
			i++;
			while (i < source.length && source[i] !== "`") {
				i += source[i] === "\\" ? 2 : 1;
			}
			i++;
			continue;
		}

		if (/[A-Za-z_]/.test(c)) {
			const start = i;
			while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
			if (source.slice(start, i) !== "local") continue;

			i = skipSpace(source, i);

			// `local function name(...)`
			if (source.startsWith("function", i) && !/[A-Za-z0-9_]/.test(source[i + 8] ?? "")) {
				i = skipSpace(source, i + 8);
				const nameStart = i;
				while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
				add(source.slice(nameStart, i));
				continue;
			}

			// `local a, b: number, c = ...` — names up to "=" or end of line.
			while (i < source.length) {
				i = skipSpace(source, i);
				const nameStart = i;
				while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
				if (i === nameStart) break;
				add(source.slice(nameStart, i));

				i = skipSpace(source, i);
				// A type annotation belongs to the name just read, not to a new one.
				if (source[i] === ":") {
					i++;
					while (i < source.length && !",=\n".includes(source[i])) i++;
					i = skipSpace(source, i);
				}
				if (source[i] !== ",") break;
				i++;
			}
			continue;
		}

		i++;
	}

	return names;
}

function skipSpace(source: string, from: number): number {
	let i = from;
	while (i < source.length && (source[i] === " " || source[i] === "\t")) i++;
	return i;
}
