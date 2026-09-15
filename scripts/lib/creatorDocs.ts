/**
 * Reading Roblox's documentation repository.
 *
 * `Roblox/creator-docs` publishes the engine reference as YAML, one file per
 * class, regenerated with every engine release. This turns one of those files
 * into the part a node needs: what a method is called, what it takes, and what
 * it gives back.
 *
 * Separate from `build-members.mjs`, which fetches and writes, so that the
 * reading half can be exercised against a saved file — see
 * `tests/creatordocs.test.ts`. A parser with no test is a parser that quietly
 * returns nothing the day the format shifts, and "no methods" looks exactly
 * like "no network".
 *
 * TypeScript rather than the plain JavaScript the other build scripts are
 * written in, for that same test: a module a test imports is a module `tsc`
 * reads, and this one has a shape worth holding it to.
 */

/** Anything the subset can produce. */
export type Yaml = string | Yaml[] | { [key: string]: Yaml } | null;

interface Line {
	text: string;
	indent: number;
}

/** A method as the catalogue stores it. See `robloxMembers.ts` for the mirror. */
export interface ParsedParam {
	name: string;
	type: string;
	enum?: string;
	optional?: true;
	summary?: string;
}

export interface ParsedMethod {
	name: string;
	from: string;
	summary: string;
	params: ParsedParam[];
	returns: string;
	yields?: true;
	pure?: true;
}

// -- a YAML subset ---------------------------------------------------------
//
// The class files are machine-generated and regular: two-space indentation,
// block scalars for prose, `[]` and `''` for empty. That is a small enough
// language to read directly, and reading it is better than a dependency whose
// whole job is the half of YAML these files never use.

/** Lines, with comments and blank lines dropped, paired with their indent. */
function linesOf(text: string): Line[] {
	return text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => ({ text: line, indent: line.length - line.trimStart().length }))
		.filter((line) => line.text.trim() !== "" && !/^\s*#/.test(line.text));
}

/** A scalar as written: quoted, plain, or an empty collection. */
function scalar(text: string): Yaml {
	const value = text.trim();
	if (value === "[]" || value === "{}") return [];
	if (value === "''" || value === '""') return "";
	if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
	if (/^".*"$/.test(value)) return value.slice(1, -1);
	return value;
}

/**
 * One block, from `at`, at `indent`. Returns the value and the line after it.
 *
 * A block is a sequence when its first line begins with `- `, and a mapping
 * otherwise. `key: |` takes every more-indented line as its text.
 */
function parseBlock(lines: Line[], at: number, indent: number): [Yaml, number] {
	if (at >= lines.length || lines[at].indent < indent) return [null, at];

	if (lines[at].text.trim().startsWith("- ")) {
		const out: Yaml[] = [];
		let i = at;
		while (i < lines.length && lines[i].indent === indent && lines[i].text.trim().startsWith("- ")) {
			const rest = lines[i].text.trim().slice(2);
			// `- name: x` is a mapping whose first key shares the dash's line, so
			// it is re-read as though it had started two columns in.
			if (/^[A-Za-z_][\w-]*:/.test(rest)) {
				const inner = [{ text: " ".repeat(indent + 2) + rest, indent: indent + 2 }];
				let j = i + 1;
				while (j < lines.length && lines[j].indent > indent) inner.push(lines[j++]);
				const [value] = parseBlock(inner, 0, indent + 2);
				out.push(value);
				i = j;
			} else {
				out.push(scalar(rest));
				i += 1;
			}
		}
		return [out, i];
	}

	const map: Record<string, Yaml> = {};
	let i = at;
	while (i < lines.length && lines[i].indent === indent) {
		const line = lines[i].text.trim();
		const split = line.indexOf(":");
		if (split < 0) break;
		const key = line.slice(0, split).trim();
		const rest = line.slice(split + 1).trim();
		i += 1;

		if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
			const text: string[] = [];
			while (i < lines.length && lines[i].indent > indent) text.push(lines[i++].text.trim());
			map[key] = text.join(" ");
		} else if (rest === "") {
			// An empty value is a nested block, or nothing at all: `default:` with
			// no value is how the docs write "this argument is required".
			const [value, next] = parseBlock(lines, i, indent + 2);
			map[key] = value;
			i = next;
		} else {
			map[key] = scalar(rest);
		}
	}
	return [map, i];
}

export function parseYaml(text: string): Record<string, Yaml> {
	const [value] = parseBlock(linesOf(text), 0, 0);
	return value !== null && !Array.isArray(value) && typeof value === "object" ? value : {};
}

// -- the shape a node wants ------------------------------------------------

/** The first sentence, which is what a menu and a tooltip have room for. */
export function firstSentence(summary: Yaml | undefined): string {
	const text = String(summary ?? "").replace(/\s+/g, " ").trim();
	if (text === "") return "";
	// `Class.RunService:IsServer()|IsServer()` is a docs cross-reference; the
	// half after the pipe is what the Creator Hub renders it as.
	const plain = text
		.replace(/`(?:Class|Enum|Datatype|Library|Global)\.[^`|]*\|([^`]*)`/g, "`$1`")
		.replace(/`(?:Class|Enum|Datatype|Library|Global)\.([^`]*)`/g, "`$1`")
		.replace(/\\([*_])/g, "$1");
	const stop = plain.search(/\.(\s|$)/);
	return (stop < 0 ? plain : plain.slice(0, stop + 1)).trim();
}

/**
 * A documented type as a Roswaal pin type.
 *
 * Numbers collapse: Luau has one number type, and a pin that said `int` would
 * be claiming a distinction the language does not make. `User` is the docs'
 * name for a user id, which is a number like any other.
 *
 * Anything unrecognised passes through unchanged, which is right for the
 * engine's own datatypes and classes — `Player`, `RaycastResult` and `Vector3`
 * are pin types already. Enum parameters arrive as the bare enum name and are
 * caught by the caller, which has the list of enums.
 */
export function pinType(type: Yaml | undefined): string {
	let name = String(type ?? "").trim();
	// `RaycastResult?` is "a RaycastResult or nil", which every pin already
	// allows: an unwired data pin is nil. The question mark says nothing a pin
	// can act on and would leave a type nothing else in the graph matches.
	if (name.endsWith("?")) name = name.slice(0, -1).trim();
	// `List<Player>`, `Dictionary<string, any>`, `Tuple<...>`. Luau has one
	// table type and Roswaal has one table pin, so the head decides and the
	// element type is documented in the summary rather than typed into a pin.
	const generic = name.indexOf("<");
	if (generic > 0) name = name.slice(0, generic).trim();
	if (name === "" || name === "()" || name === "null" || name === "void") return "";
	if (["int", "int64", "float", "double", "User"].includes(name)) return "number";
	if (["bool", "boolean"].includes(name)) return "boolean";
	if (["string", "Content", "ContentId", "BinaryString", "ProtectedString"].includes(name)) {
		return "string";
	}
	if (["Function", "function"].includes(name)) return "function";
	if (name === "Variant") return "any";
	if (["Array", "Objects", "Instances", "List", "Dictionary", "Map", "Tuple"].includes(name)) {
		return "table";
	}
	return name;
}

/**
 * Whether a method reads rather than does, and so is offered as a pure node.
 *
 * A judgement from the signature and the name, because the engine does not
 * state it: something that gives a value back, never yields, and is called
 * `IsServer` or `GetPlayers` is an answer to a question rather than an
 * instruction. It decides which node the menu reaches for and nothing else —
 * either node will call any method, so a wrong guess costs a swap.
 */
export function looksPure(method: { name: string; returns: string; yields?: true }): boolean {
	if (method.yields) return false;
	if (method.returns === "") return false;
	return /^(Is|Get|Has|Can|Find|To|Count|Read|Calculate)[A-Z]/.test(method.name);
}

/**
 * The methods of one parsed class file, as the catalogue stores them.
 *
 * Dropped rather than offered: anything behind a security context, which a game
 * script cannot call at all, and anything the engine has deprecated, which it
 * can call and should not. `isEnum` decides whether a parameter's type names an
 * enum, and is passed in because the enum list lives in the generated data
 * rather than here.
 */
export function methodsOf(
	doc: Record<string, Yaml> | null | undefined,
	className: string,
	isEnum: (name: string) => boolean = () => false,
): ParsedMethod[] {
	const out: ParsedMethod[] = [];
	const entries = doc?.methods;
	for (const raw of Array.isArray(entries) ? entries : []) {
		const entry = raw as Record<string, Yaml> | null;
		if (!entry || typeof entry.name !== "string") continue;
		const tags = Array.isArray(entry.tags) ? entry.tags : [];
		const security = typeof entry.security === "string" ? entry.security : "None";
		if (security !== "None") continue;
		if (tags.includes("Deprecated")) continue;
		if (String(entry.deprecation_message ?? "").trim() !== "") continue;

		const name = entry.name.includes(":") ? entry.name.split(":").pop()! : entry.name;
		const params = (Array.isArray(entry.parameters) ? entry.parameters : []).map((raw) => {
			const p = (raw ?? {}) as Record<string, Yaml>;
			const declared = String(p.type ?? "").trim();
			const param: ParsedParam = {
				name: String(p?.name ?? "arg"),
				type: isEnum(declared) ? "string" : pinType(declared),
			};
			if (isEnum(declared)) param.enum = declared;
			// A documented default means the call may leave the argument out. The
			// value itself is not kept: an optional pin emits nothing at all and
			// lets the engine apply its own, which cannot drift out of date.
			if (p.default !== undefined && p.default !== null && p.default !== "") {
				param.optional = true;
			}
			const summary = firstSentence(p.summary);
			if (summary) param.summary = summary;
			return param;
		});
		const returns = (Array.isArray(entry.returns) ? entry.returns : [])
			.map((r) => pinType((r as Record<string, Yaml> | null)?.type))
			.filter((t) => t !== "");

		const method: ParsedMethod = {
			name,
			from: className,
			summary: firstSentence(entry.summary),
			params,
			returns: returns.length > 0 ? returns[0] : "",
		};
		if (tags.includes("Yields")) method.yields = true;
		if (looksPure(method)) method.pure = true;
		out.push(method);
	}
	return out;
}
