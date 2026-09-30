/**
 * Wally, as a project has it on disk: `wally.toml` saying what it depends on,
 * and the folders `wally install` fills.
 *
 * Each dependency is a one-line file in `Packages/` -- a thunk:
 * `return require(script.Parent._Index["owner_name@1.2.3"]["name"])` -- and the
 * package itself lives under `_Index`. Reading both is how the project tree
 * lists what a project includes, and how a `require` of `Packages.Name` finds
 * the code it reaches.
 *
 * Pure: the text goes in, names come out. What is on disk is the caller's.
 */

export type WallyRealm = "shared" | "server" | "dev";

/** Where `wally install` puts each realm's packages, beside `wally.toml`. */
export const REALM_DIRS: Record<WallyRealm, string> = {
	shared: "Packages",
	server: "ServerPackages",
	dev: "DevPackages",
};

const SECTIONS: Record<string, WallyRealm> = {
	dependencies: "shared",
	"server-dependencies": "server",
	"dev-dependencies": "dev",
};

export interface WallyDependency {
	/** The name the project requires it by: the key in `wally.toml`. */
	alias: string;
	realm: WallyRealm;
	/** As written: `sleitnick/signal@2.0.0`, or `^2.0.0` after the `@`. */
	spec: string;
}

/**
 * The dependencies `wally.toml` lists, in the order it lists them. Only the
 * three dependency tables are read, and only `Name = "scope/name@version"`
 * lines in them: the shape `wally init` writes and every project uses.
 */
export function parseWallyToml(text: string): WallyDependency[] {
	const out: WallyDependency[] = [];
	let realm: WallyRealm | undefined;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		if (line === "") continue;
		const table = /^\[([^\]]+)\]$/.exec(line);
		if (table) {
			realm = SECTIONS[table[1].trim()];
			continue;
		}
		if (!realm) continue;
		const entry = /^["']?([A-Za-z0-9_-]+)["']?\s*=\s*["']([^"']+)["']/.exec(line);
		if (entry) out.push({ alias: entry[1], realm, spec: entry[2] });
	}
	return out;
}

/**
 * Where a thunk sends its `require`, as the names below `script.Parent`:
 * `["_Index", "sleitnick_signal@2.0.0", "signal"]`. Undefined for a file that
 * is not a thunk.
 */
export function thunkTarget(text: string): string[] | undefined {
	// At the start of a line: a thunk commented out -- a package vendored in
	// its place, as some projects do -- is not one.
	const call = /^[ \t]*return\s+require\s*\(\s*script\.Parent((?:\s*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\s*["'][^"']+["']\s*\]))+)\s*\)/m.exec(text);
	if (!call) return undefined;
	const names: string[] = [];
	for (const part of call[1].matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([^"']+)["']\s*\]/g)) {
		names.push(part[1] ?? part[2]);
	}
	return names.length > 0 ? names : undefined;
}

/** The version in an `_Index` folder name: `sleitnick_signal@2.0.0` gives `2.0.0`. */
export function indexVersion(folder: string): string | undefined {
	const at = folder.lastIndexOf("@");
	return at === -1 ? undefined : folder.slice(at + 1);
}

// ---------------------------------------------------------------------------
// Adding a package
// ---------------------------------------------------------------------------

/** `sleitnick/signal@^2.0.0`, as its parts. The version is optional when adding. */
export function parseSpec(spec: string): { scope: string; name: string; version?: string } | undefined {
	const found = /^\s*([a-z0-9_-]+)\/([a-z0-9_-]+)(?:@([^\s]+))?\s*$/i.exec(spec);
	if (!found) return undefined;
	return { scope: found[1].toLowerCase(), name: found[2].toLowerCase(), ...(found[3] ? { version: found[3] } : {}) };
}

type Semver = [number, number, number];

function semver(text: string): Semver | undefined {
	const found = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
	return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : undefined;
}

const compare = (a: Semver, b: Semver) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The newest of `versions` a Wally requirement allows: `=1.2.3` exactly, and
 * otherwise Cargo's caret -- `1.2.3` and `^1.2.3` take anything up to the next
 * major (the next minor below 1.0.0). No requirement takes the newest.
 * Pre-releases are left out, as Wally leaves them out unless named.
 */
export function pickVersion(versions: readonly string[], requirement?: string): string | undefined {
	const parsed = versions.map((v) => [v, semver(v)] as const).filter((p): p is readonly [string, Semver] => p[1] !== undefined);
	const req = requirement?.trim().replace(/^\^/, "");
	let allowed = parsed;
	if (req && req.startsWith("=")) {
		allowed = parsed.filter(([v]) => v === req.slice(1).trim());
	} else if (req) {
		const low = semver(req);
		if (!low) return undefined;
		const high: Semver = low[0] > 0 ? [low[0] + 1, 0, 0] : low[1] > 0 ? [0, low[1] + 1, 0] : [0, 0, low[2] + 1];
		allowed = parsed.filter(([, v]) => compare(v, low) >= 0 && compare(v, high) < 0);
	}
	return [...allowed].sort((a, b) => compare(b[1], a[1]))[0]?.[0];
}

/** `_Index`'s folder for a package: `sleitnick_signal@2.0.3`. */
export const indexFolder = (scope: string, name: string, version: string) => `${scope}_${name}@${version}`;

/**
 * The thunk Wally writes for a dependency: in the realm's folder, reaching
 * into `_Index`; or, for a package's own dependency, beside it inside
 * `_Index`, reaching across.
 */
export function thunkFor(folder: string, name: string, inIndex = false): string {
	const index = inIndex ? "script.Parent.Parent" : "script.Parent._Index";
	return `return require(${index}["${folder}"]["${name}"])\n`;
}

const SECTION_OF: Record<WallyRealm, string> = { shared: "dependencies", server: "server-dependencies", dev: "dev-dependencies" };

/**
 * `wally.toml` with `alias = "spec"` in the realm's table: the line replaced
 * when the alias is there, added at the end of the table when not, and the
 * table added when the file has none. Everything else is left as written.
 */
export function withDependency(text: string, realm: WallyRealm, alias: string, spec: string): string {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lines = text.split(/\r?\n/);
	const section = SECTION_OF[realm];
	const line = `${alias} = "${spec}"`;
	let start = lines.findIndex((l) => l.trim() === `[${section}]`);
	if (start === -1) {
		while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
		return [...lines, "", `[${section}]`, line, ""].join(eol);
	}
	let end = start + 1;
	while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
	const existing = lines.slice(start + 1, end).findIndex((l) => new RegExp(`^\\s*["']?${alias}["']?\\s*=`).test(l));
	if (existing !== -1) {
		lines[start + 1 + existing] = line;
	} else {
		// After the table's last line with something on it, before any blank ones.
		let at = end;
		while (at > start + 1 && lines[at - 1].trim() === "") at--;
		lines.splice(at, 0, line);
	}
	return lines.join(eol);
}

/** What a Wally package's own `wally.toml` says it is, from `[package]`. */
export function packageOf(text: string): { scope: string; name: string; version: string; realm?: WallyRealm } | undefined {
	let inPackage = false;
	const out: Record<string, string> = {};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		const table = /^\[([^\]]+)\]$/.exec(line);
		if (table) {
			inPackage = table[1].trim() === "package";
			continue;
		}
		if (!inPackage) continue;
		const entry = /^([a-z-]+)\s*=\s*["']([^"']*)["']/.exec(line);
		if (entry) out[entry[1]] = entry[2];
	}
	const id = out.name ? parseSpec(out.name) : undefined;
	if (!id || !out.version) return undefined;
	const realm = out.realm === "server" ? "server" : out.realm === "shared" ? "shared" : undefined;
	return { scope: id.scope, name: id.name, version: out.version, ...(realm ? { realm } : {}) };
}
