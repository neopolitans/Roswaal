/**
 * Rojo's project files as Rojo reads them now: JSON with comments and
 * trailing commas (Rojo 7.6.1), and `.project.jsonc` beside `.project.json`
 * (7.7.0). Read wherever Roswaal reads a project file: Import Rojo project, a
 * folder's own project file, and Wally's packages.
 *
 * Only the reading is loosened. What Roswaal writes stays plain JSON, which a
 * `.jsonc` file may hold as well.
 */

/** A Rojo project file by its name: `default.project.json`, `lobby.project.jsonc`. */
export function isProjectFile(name: string): boolean {
	return /\.project\.jsonc?$/i.test(name);
}

/** The names a folder's own project file may have, the plain one first. */
export const FOLDER_PROJECT_FILES = ["default.project.json", "default.project.jsonc"] as const;

/**
 * Comments and trailing commas taken out, and the rest parsed as JSON.
 * Throws as `JSON.parse` does on anything that is not JSON after that. A
 * comment's characters inside a string are part of the string.
 */
export function parseJsonc(text: string): unknown {
	return JSON.parse(withoutTrailingCommas(withoutComments(text)));
}

function withoutComments(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '"') {
			const end = stringEnd(text, i);
			out += text.slice(i, end);
			i = end;
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
		} else if (c === "/" && text[i + 1] === "*") {
			const close = text.indexOf("*/", i + 2);
			const end = close < 0 ? text.length : close + 2;
			// Keep the line breaks, so an error still names the right line.
			out += text.slice(i, end).replace(/[^\n]/g, " ");
			i = end;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

function withoutTrailingCommas(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '"') {
			const end = stringEnd(text, i);
			out += text.slice(i, end);
			i = end;
			continue;
		}
		if (c === ",") {
			let j = i + 1;
			while (j < text.length && /\s/.test(text[j])) j++;
			if (text[j] === "}" || text[j] === "]") {
				i++;
				continue;
			}
		}
		out += c;
		i++;
	}
	return out;
}

/** Just past the string that opens at `start`, escapes included. */
function stringEnd(text: string, start: number): number {
	let i = start + 1;
	while (i < text.length) {
		if (text[i] === "\\") i += 2;
		else if (text[i] === '"') return i + 1;
		else i++;
	}
	return text.length;
}
