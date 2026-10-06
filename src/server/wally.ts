/**
 * Adding Wally packages to a project, from the registry or from a zip -- and
 * vendoring code that is not a Wally package, from a zip or a GitHub repo.
 *
 * The registry is someone else's service with limits of its own, so this asks
 * it as little as it can: the dependency line goes into `wally.toml` first,
 * then one request for a package's versions and one for its archive, for the
 * package and each dependency not already installed, in turn, under a budget.
 * Nothing is retried and nothing is polled. When the budget runs out or a
 * request fails, what was written stays written: the line is in `wally.toml`,
 * the package shows as not installed, and its zip -- downloaded by hand --
 * can be inserted instead.
 *
 * What `wally install` writes is what this writes: a thunk per dependency in
 * the realm's folder, and each package in `_Index/scope_name@version/name/`.
 */

import { parseProject } from "../core/rojoImport.js";
import { unzip, type ZipEntry } from "../core/unzip.js";
import {
	indexFolder,
	packageOf,
	parseSpec,
	parseWallyToml,
	pickVersion,
	REALM_DIRS,
	thunkFor,
	thunkTarget,
	type WallyRealm,
	withDependency,
	withoutDependency,
} from "../core/wally.js";
import { errorMessage, HttpError, UserError } from "./errors.js";
import { walkFiles } from "./files.js";
import { fs, path } from "./host.js";
import { type OpenProject, safeJoin } from "./project.js";

const REGISTRY = "https://api.wally.run/v1";

/** Requests one add may make of the registry, for the package and its dependencies together. */
export const REQUEST_BUDGET = 16;

export interface WallyOutcome {
	/** The line written to wally.toml, when one was. */
	line?: { realm: WallyRealm; alias: string; spec: string };
	/** `_Index` folders written, or the vendored folder. */
	installed: string[];
	/** Why the rest was not installed, when it was not. */
	problem?: string;
	/** How many requests the registry was asked. */
	requests: number;
}

/**
 * Refuses a package's names unless each is a plain path segment.
 *
 * The scope, name and version come from the registry or from a zip's own
 * `wally.toml`, and the alias from whoever typed it. All of them become
 * folder and file names, so `../` in any one of them would write, or delete,
 * somewhere else in the project.
 */
function assertPlainNames(names: {
	scope?: string;
	name?: string;
	version?: string;
	alias?: string;
}): void {
	// Dots are fine in a folder name, as long as that is not all it is.
	const word = /^(?!\.+$)[A-Za-z0-9_.-]+$/;
	const version = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]*)?$/;
	for (const key of ["scope", "name", "alias"] as const) {
		const value = names[key];
		if (value !== undefined && !word.test(value))
			throw new UserError(`"${value}" is not a package ${key} Roswaal can install.`);
	}
	if (names.version !== undefined && !version.test(names.version)) {
		throw new UserError(`"${names.version}" is not a version Roswaal can install.`);
	}
}

/** A name to require a package by: `signal` gives `Signal`, `rbx-util` gives `RbxUtil`. */
export function aliasFor(name: string): string {
	return name
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join("");
}

interface VersionMetadata {
	package: { version: string };
	dependencies?: Record<string, string>;
}

class Installer {
	requests = 0;
	installed: string[] = [];

	constructor(private readonly project: OpenProject) {}

	private async ask(url: string): Promise<Response> {
		if (this.requests >= REQUEST_BUDGET) {
			throw new UserError(
				`Stopped after ${REQUEST_BUDGET} requests to the Wally registry, to go easy on it.`,
			);
		}
		this.requests++;
		const response = await fetch(url, { headers: { "Wally-Version": "0.3.2" } });
		if (!response.ok)
			throw new HttpError(
				502,
				`The Wally registry answered ${response.status} for ${url.replace(REGISTRY, "")}.`,
			);
		return response;
	}

	async write(rel: string, data: string | Uint8Array): Promise<void> {
		const abs = safeJoin(this.project.root, rel);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		if (typeof data === "string") await fs.writeFile(abs, data, "utf8");
		else await fs.writeFile(abs, data);
	}

	private exists = (rel: string) =>
		fs.stat(safeJoin(this.project.root, rel)).then(
			() => true,
			() => false,
		);

	/**
	 * One package and what it depends on: its thunk -- in the realm's folder,
	 * or beside `parent` in `_Index` for a dependency -- and, unless the version
	 * is already there, its archive.
	 */
	async install(
		scope: string,
		name: string,
		requirement: string | undefined,
		folder: string,
		alias: string,
		parent?: string,
	): Promise<string> {
		const metadata = (await (
			await this.ask(`${REGISTRY}/package-metadata/${scope}/${name}`)
		).json()) as { versions: VersionMetadata[] };
		const version = pickVersion(
			metadata.versions.map((v) => v.package.version),
			requirement,
		);
		if (!version)
			throw new UserError(`No version of ${scope}/${name} matches ${requirement ?? "anything"}.`);
		assertPlainNames({ scope, name, version, alias });
		const index = indexFolder(scope, name, version);
		const thunk = parent ? `${folder}/_Index/${parent}/${alias}.lua` : `${folder}/${alias}.lua`;
		await this.write(thunk, thunkFor(index, name, parent !== undefined));
		const home = `${folder}/_Index/${index}/${name}`;
		if (!(await this.exists(home))) {
			const bytes = new Uint8Array(
				await (
					await this.ask(`${REGISTRY}/package-contents/${scope}/${name}/${version}`)
				).arrayBuffer(),
			);
			const { files } = await unzip(bytes);
			for (const file of files) await this.write(`${home}/${file.path}`, file.bytes);
			this.installed.push(index);
			const entry = metadata.versions.find((v) => v.package.version === version);
			for (const [depAlias, depSpec] of Object.entries(entry?.dependencies ?? {})) {
				const dep = parseSpec(depSpec);
				if (dep) await this.install(dep.scope, dep.name, dep.version, folder, depAlias, index);
			}
		}
		return version;
	}
}

async function readToml(project: OpenProject): Promise<string> {
	return fs.readFile(safeJoin(project.root, "wally.toml"), "utf8").catch(() => "[dependencies]\n");
}

/**
 * Adds `scope/name[@version]` to wally.toml and installs it from the registry,
 * with what it depends on. The line is written first, so a failed download
 * leaves a package the tree says is not installed, for its zip to fill.
 */
export async function addFromWally(
	project: OpenProject,
	spec: string,
	realm: WallyRealm = "shared",
	alias?: string,
): Promise<WallyOutcome> {
	const parsed = parseSpec(spec);
	if (!parsed)
		throw new UserError(
			`"${spec}" is not a package: write it as scope/name, or scope/name@version.`,
		);
	const name = alias?.trim() || aliasFor(parsed.name);
	const installer = new Installer(project);
	let line: WallyOutcome["line"];
	const writeLine = async (version: string) => {
		const text = withDependency(
			await readToml(project),
			realm,
			name,
			`${parsed.scope}/${parsed.name}@${version}`,
		);
		await installer.write("wally.toml", text);
		line = { realm, alias: name, spec: `${parsed.scope}/${parsed.name}@${version}` };
	};
	// Asked for a version: the line can go in before anything is fetched.
	if (parsed.version) await writeLine(parsed.version);
	try {
		const version = await installer.install(
			parsed.scope,
			parsed.name,
			parsed.version,
			REALM_DIRS[realm],
			name,
		);
		if (!parsed.version) await writeLine(`^${version}`);
		return {
			...(line ? { line } : {}),
			installed: installer.installed,
			requests: installer.requests,
		};
	} catch (err) {
		return {
			...(line ? { line } : {}),
			installed: installer.installed,
			problem: errorMessage(err),
			requests: installer.requests,
		};
	}
}

/** The entries under one folder all share, when a zip was made of a folder: GitHub's always is. */
function unwrapped(files: ZipEntry[]): ZipEntry[] {
	const tops = new Set(files.map((f) => f.path.split("/")[0]));
	if (tops.size !== 1 || files.every((f) => !f.path.includes("/"))) return files;
	const [top] = tops;
	return files
		.map((f) => ({ ...f, path: f.path.slice(top.length + 1) }))
		.filter((f) => f.path !== "");
}

/**
 * A package from a zip. A Wally package -- its own wally.toml names it --
 * goes where `wally install` would put it, with its line in the project's
 * wally.toml. Anything else is vendored: its module, found through its own
 * project file or its `init` file, copied into `Packages/<alias>/`.
 */
export async function installZip(
	project: OpenProject,
	bytes: Uint8Array,
	options: { alias?: string; realm?: WallyRealm; fileName?: string; vendor?: boolean } = {},
): Promise<WallyOutcome> {
	const files = unwrapped((await unzip(bytes)).files);
	const byPath = new Map(files.map((f) => [f.path, f]));
	const text = (rel: string) => {
		const found = byPath.get(rel);
		return found ? new TextDecoder().decode(found.bytes) : undefined;
	};
	const installer = new Installer(project);
	const realm = options.realm ?? "shared";
	const folder = REALM_DIRS[realm];

	const manifest = text("wally.toml");
	const pkg = manifest && !options.vendor ? packageOf(manifest) : undefined;
	if (pkg) {
		const alias = options.alias?.trim() || aliasFor(pkg.name);
		assertPlainNames({ ...pkg, alias });
		const index = indexFolder(pkg.scope, pkg.name, pkg.version);
		for (const file of files)
			await installer.write(`${folder}/_Index/${index}/${pkg.name}/${file.path}`, file.bytes);
		await installer.write(`${folder}/${alias}.lua`, thunkFor(index, pkg.name));
		const spec = `${pkg.scope}/${pkg.name}@${pkg.version}`;
		await installer.write(
			"wally.toml",
			withDependency(await readToml(project), realm, alias, spec),
		);
		// Its own dependencies are not fetched: a zip is what is used when the
		// registry is not reachable. The tree says which are missing.
		const needs = parseWallyToml(manifest ?? "")
			.filter((d) => d.realm !== "dev")
			.map((d) => d.alias);
		return {
			line: { realm, alias, spec },
			installed: [index],
			...(needs.length
				? { problem: `It depends on ${needs.join(", ")}, which the zip does not include.` }
				: {}),
			requests: 0,
		};
	}

	// Not a Wally package: find its module and vendor it.
	const projectFile = text("default.project.json");
	const treePath = projectFile
		? (parseProject(projectFile) as { tree?: { $path?: unknown } } | undefined)?.tree?.$path
		: undefined;
	const candidates = [
		typeof treePath === "string" ? treePath.replace(/^\.\//, "").replace(/\/+$/, "") : undefined,
		"",
		"src",
		"lib",
	].filter((c): c is string => c !== undefined);
	const root =
		candidates.find((dir) =>
			["init.luau", "init.lua"].some((init) => byPath.has(dir ? `${dir}/${init}` : init)),
		) ?? candidates.find((dir) => dir !== "" && byPath.has(`${dir}.luau`));
	if (root === undefined) {
		throw new UserError(
			"There is no module in that zip to vendor: no init.luau at its top, in src/ or lib/, and no project file saying where.",
		);
	}
	const base =
		(options.fileName ?? "Package")
			.replace(/\.zip$/i, "")
			.split(/[^A-Za-z0-9_-]/)
			.filter(Boolean)
			.pop() ?? "Package";
	const alias = options.alias?.trim() || aliasFor(base);
	assertPlainNames({ alias });
	const target = `Packages/${alias}`;
	// A thunk or a folder of that name already: Rojo cannot have both, and one
	// would be written over.
	for (const taken of [`${target}.lua`, `${target}.luau`, target]) {
		if (
			await fs.stat(safeJoin(project.root, taken)).then(
				() => true,
				() => false,
			)
		) {
			throw new UserError(
				`Packages already has ${alias}. Give this one another name to be required by.`,
			);
		}
	}
	const prefix = root === "" ? "" : `${root}/`;
	let written = 0;
	for (const file of files) {
		if (!file.path.startsWith(prefix) || !/\.(luau?|json|txt|md)$/i.test(file.path)) continue;
		await installer.write(`${target}/${file.path.slice(prefix.length)}`, file.bytes);
		written++;
	}
	if (written === 0) throw new UserError("Nothing in that zip's module was Luau.");
	return { installed: [target], requests: 0 };
}

/** Vendors a GitHub repository, `owner/repo[@ref]`, fetched by the host. */
export async function installGithub(
	project: OpenProject,
	repo: string,
	download: (owner: string, repo: string, ref: string) => Promise<Uint8Array>,
	alias?: string,
): Promise<WallyOutcome> {
	const found = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@(\S+))?\s*$/.exec(
		repo.replace(/^https?:\/\/github\.com\//, ""),
	);
	if (!found)
		throw new UserError(
			`"${repo}" is not a repository: write it as owner/repo, or owner/repo@branch.`,
		);
	const [, owner, name, ref = ""] = found;
	const bytes = await download(owner, name.replace(/\.git$/, ""), ref);
	return installZip(project, bytes, {
		alias: alias || aliasFor(name.replace(/\.git$/, "")),
		fileName: name,
		vendor: true,
	});
}

// ---------------------------------------------------------------------------
// Removing a package
// ---------------------------------------------------------------------------

/** Folders never searched for a package's uses: Wally's own, and what is not the game's. */
const NOT_SEARCHED = new Set(["Packages", "ServerPackages", "DevPackages", "node_modules", ".git"]);

/**
 * Files that still reach for `Packages.<alias>` -- a require in Luau, or a
 * graph's node holding that path -- so removing it can say what would break.
 */
export async function packageUses(
	project: OpenProject,
	alias: string,
	realm: WallyRealm = "shared",
): Promise<string[]> {
	assertPlainNames({ alias });
	const folder = REALM_DIRS[realm];
	const pattern = new RegExp(
		`\\b${folder}\\s*(?:\\.\\s*|:\\s*WaitForChild\\s*\\(\\s*["']|\\[\\s*["'])${alias}\\b`,
	);
	const out: string[] = [];
	const files = await walkFiles(project.root, {
		skip: NOT_SEARCHED,
		accept: (name) => /\.(luau?|nodescript)$/i.test(name),
	});
	for (const file of files) {
		// Gone since the walk listed it: then it uses nothing.
		const text = await fs.readFile(file.abs, "utf8").catch(() => "");
		if (pattern.test(text)) out.push(file.path);
	}
	return out;
}

export interface RemovedPackage {
	/** `_Index` folders deleted: the package's, and what only it needed. */
	removed: string[];
	/** Files that still reach for it, which will now fail to. */
	uses: string[];
	/** Its file in Packages/ when that is code, not a thunk: left, for its owner to delete. */
	kept?: string;
}

/**
 * Takes a Wally dependency out: its line in wally.toml, its thunk, and the
 * `_Index` folders only it kept -- its own, and dependencies nothing else
 * needs. What was there before and reached by nothing is left alone: a
 * folder a vendored package stopped using is the project's to clear, not a
 * side effect of removing something else.
 */
export async function removePackage(
	project: OpenProject,
	alias: string,
	realm: WallyRealm = "shared",
): Promise<RemovedPackage> {
	assertPlainNames({ alias });
	const folder = REALM_DIRS[realm];
	const uses = await packageUses(project, alias, realm);
	const before = await reachable(project, folder);
	const toml = await fs.readFile(safeJoin(project.root, "wally.toml"), "utf8").catch(() => null);
	if (toml !== null)
		await fs.writeFile(
			safeJoin(project.root, "wally.toml"),
			withoutDependency(toml, alias),
			"utf8",
		);
	// Only Wally's thunk goes. A file of code put there in its place -- a
	// package vendored over its thunk -- is somebody's, and stays.
	let kept: string | undefined;
	for (const ext of [".lua", ".luau"]) {
		const rel = `${folder}/${alias}${ext}`;
		const text = await fs.readFile(safeJoin(project.root, rel), "utf8").catch(() => null);
		if (text === null) continue;
		if (thunkTarget(text)) await fs.rm(safeJoin(project.root, rel), { force: true });
		else kept = rel;
	}
	const after = await reachable(project, folder);
	const removed = [...before].filter((f) => !after.has(f)).sort();
	const index = safeJoin(project.root, `${folder}/_Index`);
	for (const name of removed) {
		// `reachable` only follows plain names; this is the second lock, on the
		// one line that deletes a folder and everything in it.
		const doomed = safeJoin(project.root, `${folder}/_Index/${name}`);
		if (path.dirname(doomed) !== index) continue;
		await fs.rm(doomed, { recursive: true, force: true });
	}
	return { removed, uses, ...(kept ? { kept } : {}) };
}

/** One folder's name: no separator, and not `.` or `..`. */
function isFolderName(name: string): boolean {
	return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
}

/** The `_Index` folders the realm's thunks reach, following each package's own thunks. */
async function reachable(project: OpenProject, folder: string): Promise<Set<string>> {
	const read = (rel: string) => fs.readFile(safeJoin(project.root, rel), "utf8").catch(() => "");
	const thunksIn = async (dir: string) =>
		(await fs.readdir(safeJoin(project.root, dir), { withFileTypes: true }).catch(() => []))
			.filter((e) => !e.isDirectory() && /\.luau?$/i.test(e.name))
			.map((e) => `${dir}/${e.name}`);
	const reached = new Set<string>();
	const queue: string[] = [];
	const follow = async (thunk: string) => {
		const names = thunkTarget(await read(thunk));
		// `script.Parent._Index[folder]` from the top, `script.Parent.Parent[folder]` from inside.
		const target = names?.[0] === "_Index" || names?.[0] === "Parent" ? names[1] : undefined;
		// A thunk is text in the project, and anyone's to write: what it names
		// is a folder in `_Index` only if it is one plain name. `..` would be
		// `Packages` itself, and `../..` the project, when the unreached ones
		// are removed.
		if (target && isFolderName(target) && !reached.has(target)) {
			reached.add(target);
			queue.push(target);
		}
	};
	for (const thunk of await thunksIn(folder)) await follow(thunk);
	while (queue.length) {
		for (const thunk of await thunksIn(`${folder}/_Index/${queue.shift()}`)) await follow(thunk);
	}
	return reached;
}
