/**
 * String quoting, kept apart from the rest of the lexical helpers because it
 * is the one place that has to reason about raw character codes.
 */

const DEL = 127;
const FIRST_PRINTABLE = 32;

/** Renders a JavaScript string as a Luau double-quoted string literal. */
export function quoteString(s: string): string {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const code = s.charCodeAt(i);
		if (ch === "\\") out += "\\\\";
		else if (ch === '"') out += '\\"';
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		// Anything else below the printable range, plus DEL, would land in the
		// generated file verbatim and corrupt it.
		else if (code < FIRST_PRINTABLE || code === DEL) out += "\\" + code;
		else out += ch;
	}
	return `"${out}"`;
}
