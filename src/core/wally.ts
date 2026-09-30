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
