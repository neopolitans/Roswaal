/**
 * A project from nothing: what `roswaal new`, the daemon's start page and the
 * web editor's all write, so the three cannot make different projects.
 *
 * `roswaal init` makes an existing folder a Roswaal project and writes no more
 * than it must, because the folder already holds somebody's work. This is the
 * other case -- an empty folder, and somebody who wants to be writing a graph
 * in it a minute from now -- so it writes what `rojo init` would and one graph
 * to start from:
 *
 *     roswaal.json
 *     .roswaal/scripts/Game.nodemap                       -> default.project.json
 *     .roswaal/scripts/ServerScriptService/Server/Main.nodescript
 *     place.rbxlx                                         (when asked for)
 *
 * The map syncs `src/` into the places `rojo init` uses: Server into
 * ServerScriptService, Client into StarterPlayerScripts and Shared into
 * ReplicatedStorage. Compiling it writes `default.project.json` and makes the
 * three folders; compiling `Main` writes the first script into one of them.
 * Neither is done here: this says what a project starts as, and whoever writes
 * it compiles it the way it compiles any project.
 *
 * A Lune project has no map and no place, and its graph is `main` at the top.
 */

import { serialiseScript } from "./compiler/index.js";
import { type MapNode, type NodeMap, serialiseMap } from "./nodemap.js";
import { blankPlaceXml } from "./rbx/blankPlace.js";
import {
	defaultConfig,
	emptyScript,
	type NodeScript,
	type RoswaalConfig,
	SCHEMA_VERSION,
	type Target,
} from "./schema.js";

export interface NewProjectOptions {
	/** What the project is called: the Rojo project's name, and the folder's. */
	name: string;
	target: Target;
	/** Write `place.rbxlx` and point the project at it. Roblox only. */
	place: boolean;
}

export interface NewProject {
	config: RoswaalConfig;
	/** Project-relative path to text, everything but `roswaal.json`. */
	files: Record<string, string>;
}

/** The place's file name, at the project's root, where `findPlaceFile` looks. */
export const NEW_PLACE_FILE = "place.rbxlx";

/**
 * Why a name will not do for a project, or null when it will.
 *
 * It becomes a folder on three kinds of disk and the name in a Rojo project,
 * so it keeps to what all of them take without surprises.
 */
export function projectNameProblem(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed === "") return "A project needs a name.";
	if (trimmed !== name) return "A project's name cannot start or end with a space.";
	if (name.length > 64) return "A project's name is 64 characters at most.";
	if (name === "." || name === "..") return `"${name}" is not a name a folder can have.`;
	if (!/^[A-Za-z0-9 _.-]+$/.test(name)) {
		return "A project's name is letters, numbers, spaces, dots, dashes and underscores.";
	}
	return null;
}

/** The first graph: Script Start, then Print "Hello world". */
function helloGraph(name: string, target: Target, makeId: () => string): NodeScript {
	const start = makeId();
	const print = makeId();
	return {
		...emptyScript(name, makeId()),
		target,
		nodes: [
			{ id: start, def: "script.begin", x: 0, y: 0 },
			{
				id: print,
				def: "debug.print",
				x: 260,
				y: 0,
				literals: { value: { t: "string", v: "Hello world" } },
			},
		],
		links: [{ id: makeId(), from: { node: start, pin: "then" }, to: { node: print, pin: "in" } }],
	};
}

/** A folder Rojo syncs from `src/`, inside the service or container named. */
function synced(name: string, path: string, makeId: () => string): MapNode {
	return { id: makeId(), name, className: "Folder", path, children: [] };
}

/** `rojo init`'s three folders, as a node map. */
function gameMap(name: string, makeId: () => string): NodeMap {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id: makeId(),
		name,
		output: "default.project.json",
		root: {
			id: makeId(),
			name: "DataModel",
			className: "DataModel",
			children: [
				{
					id: makeId(),
					name: "ReplicatedStorage",
					children: [synced("Shared", "src/ReplicatedStorage/Shared", makeId)],
				},
				{
					id: makeId(),
					name: "ServerScriptService",
					children: [synced("Server", "src/ServerScriptService/Server", makeId)],
				},
				{
					id: makeId(),
					name: "StarterPlayer",
					children: [
						{
							id: makeId(),
							name: "StarterPlayerScripts",
							children: [synced("Client", "src/StarterPlayer/StarterPlayerScripts/Client", makeId)],
						},
					],
				},
			],
		},
	};
}

/** What git should leave alone: Studio's lock files and Rojo's sourcemap. */
const GITIGNORE = `# Roblox Studio lock files
/*.rbxlx.lock
/*.rbxl.lock

sourcemap.json
`;

/**
 * Everything a new project is, as text. `makeId` names its graphs and map
 * nodes; pass `crypto.randomUUID` for a real project and a counter in a test.
 */
export function newProject(options: NewProjectOptions, makeId: () => string): NewProject {
	const problem = projectNameProblem(options.name);
	if (problem) throw new Error(problem);

	if (options.target === "lune") {
		const config: RoswaalConfig = { ...defaultConfig(), target: "lune", compileMode: "hot" };
		const main = helloGraph("main", "lune", makeId);
		return {
			config,
			files: {
				".gitignore": GITIGNORE,
				[`${config.sourceDir}/main.nodescript`]: serialiseScript(main),
			},
		};
	}

	const config: RoswaalConfig = {
		...defaultConfig(),
		compileMode: "hot",
		...(options.place ? { place: NEW_PLACE_FILE } : {}),
	};
	const main = helloGraph("Main", "roblox", makeId);
	return {
		config,
		files: {
			".gitignore": GITIGNORE,
			[`${config.sourceDir}/Game.nodemap`]: serialiseMap(gameMap(options.name, makeId)),
			[`${config.sourceDir}/ServerScriptService/Server/Main.nodescript`]: serialiseScript(main),
			...(options.place ? { [NEW_PLACE_FILE]: blankPlaceXml() } : {}),
		},
	};
}
