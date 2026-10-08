/**
 * The roswaal command line.
 *
 *     roswaal new <folder>      make a new project in an empty folder
 *     roswaal init              create roswaal.json and .roswaal/ in this project
 *     roswaal serve             start the daemon and the editor for this project
 *     roswaal stop              stop a running daemon
 *     roswaal restart           stop, then serve again
 *     roswaal status            is a daemon running here, and what is it serving?
 *     roswaal compile           compile every graph once and exit
 *     roswaal watch             recompile on change, without the editor
 *     roswaal check             one-shot health probe, for scripts and agents
 *     roswaal help
 *
 * Shaped after Rojo's CLI on purpose: `roswaal serve` in a
 * project directory should feel like `rojo serve` does, because it sits beside
 * it in the same workflow and a tool that invents its own conventions makes you
 * learn twice.
 *
 * `stop` and `restart` reach a running daemon over HTTP rather than through a
 * PID file — see POST /api/shutdown for why.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { NEW_PLACE_FILE } from "../core/newProject.js";
import { readRbx } from "../core/rbx/index.js";
import { describePlaceReport } from "../core/rbx/placeExport.js";
import { planImport, surveyPlace } from "../core/rbx/placeImport.js";
import { createDaemon, DEFAULT_PORT, hasBundledEditor } from "../server/app.js";
import { errorMessage } from "../server/errors.js";
import { createProject } from "../server/newProject.js";
import {
	type CompileOutcome,
	collectMaps,
	compileAll,
	compileMap,
	compileScript,
	describeOutcome,
	exportPlace,
	findOrphanOutputs,
	importRojoProject,
	initProject,
	isInitialised,
	type OpenProject,
	openProject,
	placeReport,
	removeOutputs,
	writePlaceImport,
} from "../server/project.js";
import { DynamicCompiler } from "../server/watcher.js";
import { type Args, flagNumber, flagString, parseInvocation } from "./args.js";
import { EXAMPLE_PACK } from "./examplePack.js";
import { helpLines } from "./help.js";
import { banner, bold, cyan, dim, green, red, yellow } from "./style.js";
import { VERSION } from "./version.js";

const HEALTH_TIMEOUT_MS = 1500;
const STOP_TIMEOUT_MS = 5000;
const STOP_POLL_MS = 150;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/** The project directory: `--root`, or wherever the command was typed. */
function resolveRoot(args: Args): string {
	// The shim records where the user actually was, because it may have changed
	// directory to find the tool's own files.
	const launchedFrom = process.env.ROSWAAL_CWD ?? process.cwd();
	const given = flagString(args, "root");
	return given ? path.resolve(launchedFrom, given) : launchedFrom;
}

/**
 * The project a command works on, or null after saying why there is none.
 *
 * Any folder opens, with the default settings, so a command that works on a
 * project refuses one with no `roswaal.json` here -- rather than serving or
 * compiling a folder that only looks like a project because nothing checked.
 */
async function projectHere(root: string): Promise<OpenProject | null> {
	try {
		const project = await openProject(root);
		if (project.initialised) return project;
		console.log(red(`${root} is not a Roswaal project: it has no roswaal.json`));
	} catch (err) {
		console.log(red(`could not open ${root}`));
		console.log(dim(`  ${errorMessage(err)}`));
	}
	console.log(dim("  run `roswaal init` here first"));
	return null;
}

// ---------------------------------------------------------------------------
// Daemon discovery
// ---------------------------------------------------------------------------

interface Health {
	ok: boolean;
	project: string | null;
	version?: string;
}

/** Nothing listening returns null rather than throwing. */
async function probeDaemon(port: number): Promise<Health | null> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		return (await response.json()) as Health;
	} catch {
		return null;
	}
}

/**
 * Stops a daemon and reports what actually happened.
 *
 * It must never claim success it has not observed. Success is defined as "the
 * health probe stopped answering" — not "we sent the request" — so a daemon
 * that ignores the call is reported as failed rather than silently left
 * running. Waiting for the socket to close also stops `restart` from racing the
 * old listener into an address-in-use error.
 */
async function stopDaemon(port: number): Promise<"stopped" | "none" | "failed"> {
	if ((await probeDaemon(port)) === null) return "none";

	try {
		await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
			method: "POST",
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});
	} catch {
		// Deliberately ignored: the daemon exits mid-response, so a transport
		// error here says nothing about whether it is going to stop.
	}

	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleep(STOP_POLL_MS);
		if ((await probeDaemon(port)) === null) return "stopped";
	}
	return "failed";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ctrl+C ends a blocking command, and says so on a line of its own.
 *
 * Left to the default, Node dies of the signal, and a Windows shell above it
 * sees a process killed by Ctrl+C -- which is what prints `^C` over the last
 * line of output. Stopping is how `serve` and `watch` are meant to end, so it
 * exits cleanly instead. Unix terminals echo `^C` themselves with no newline
 * after it, hence the leading one there.
 */
function exitOnInterrupt(message: string): void {
	process.once("SIGINT", () => {
		const lead = process.platform === "win32" ? "" : "\n";
		process.stdout.write(`${lead}${dim(message)}\n`);
		process.exit(0);
	});
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * `roswaal new <folder>`: a project from nothing, in a folder that is empty or
 * not there yet. What it holds is `core/newProject.ts`'s to say.
 */
async function commandNew(args: Args): Promise<number> {
	const launchedFrom = process.env.ROSWAAL_CWD ?? process.cwd();
	const given = args.positional[1];
	if (!given) {
		console.log(red("roswaal new needs a folder to make the project in: roswaal new <folder>"));
		return 2;
	}
	const root = path.resolve(launchedFrom, given);
	const target = args.flags.lune === true ? "lune" : "roblox";
	const place = target === "roblox" && args.flags["no-place"] !== true;
	console.log(`${bold("roswaal new")} ${dim(root)}`);
	try {
		const project = await createProject(root, { name: path.basename(root), target, place });
		console.log(
			`  ${green("project ")} roswaal.json, ${target === "lune" ? "for Lune" : "for Roblox"}`,
		);
		if (target === "roblox") {
			console.log(
				`  ${green("rojo    ")} default.project.json, from .roswaal/scripts/Game.nodemap`,
			);
			console.log(
				`  ${green("graph   ")} Main, compiled to ${project.config.outDir}/ServerScriptService/Server`,
			);
			if (place) console.log(`  ${green("place   ")} ${NEW_PLACE_FILE}`);
		} else {
			console.log(`  ${green("graph   ")} main, compiled to ${project.config.outDir}/main.luau`);
		}
		console.log("");
		console.log(dim(`  Next: cd ${JSON.stringify(given)} and roswaal serve`));
		return 0;
	} catch (err) {
		console.log(red(`  ${errorMessage(err)}`));
		return 1;
	}
}

async function commandInit(args: Args): Promise<number> {
	const root = resolveRoot(args);
	console.log(`${bold("roswaal init")} ${dim(root)}`);

	const { config, steps } = await initProject(root, { examplePack: EXAMPLE_PACK });
	for (const step of steps) {
		console.log(`  ${step.created ? green("created ") : dim("kept    ")} ${step.path}`);
	}
	console.log("");
	console.log(dim("  Next: roswaal serve"));
	console.log(dim("  Graphs are committed. Generated Luau goes to " + config.outDir + "."));
	return 0;
}

/**
 * `roswaal import default.project.json`: the project file of the folder it is
 * in, read into a node map there. The folder becomes a Roswaal project if it
 * was not one.
 */
async function commandImportRojo(file: string): Promise<number> {
	const root = path.dirname(file);
	console.log(`${bold("roswaal import")} ${dim(file)}`);
	const hadConfig = await isInitialised(root);
	try {
		if (!hadConfig) await initProject(root);
		const outcome = await importRojoProject(await openProject(root), path.basename(file));
		if (!hadConfig)
			console.log(`  ${green("config  ")} roswaal.json, so this folder is a Roswaal project`);
		console.log(`  ${green("map     ")} ${outcome.mapPath}`);
		for (const problem of outcome.problems) console.log(`  ${yellow("kept    ")} ${problem}`);
		if (outcome.takenOver) {
			console.log(
				`  ${green("rojo    ")} ${outcome.file} is written from the map now; compiling leaves it as it is until the map changes`,
			);
		} else {
			console.log(
				`  ${yellow("rojo    ")} ${outcome.file} is left to you: the map would write it differently. Compile with --force to take it over.`,
			);
		}
		return 0;
	} catch (err) {
		console.log(red(`  ${errorMessage(err)}`));
		return 1;
	}
}

async function commandImport(args: Args): Promise<number> {
	const launchedFrom = process.env.ROSWAAL_CWD ?? process.cwd();
	const given = args.positional[1];
	if (!given) {
		console.log(
			red(
				"roswaal import needs a place file or a Rojo project file: roswaal import <place.rbxl> [directory], or roswaal import default.project.json",
			),
		);
		return 2;
	}
	if (/\.project\.json$/i.test(given)) return commandImportRojo(path.resolve(launchedFrom, given));
	const placePath = path.resolve(launchedFrom, given);
	const ext = path.extname(placePath).toLowerCase();
	const stem = path.basename(placePath, path.extname(placePath));
	const root = path.resolve(launchedFrom, args.positional[2] ?? stem);
	const scope = flagString(args, "scripts") ?? "rojo";
	if (scope !== "rojo" && scope !== "all") {
		console.log(red(`--scripts is rojo or all, not \`${scope}\``));
		return 2;
	}
	console.log(`${bold("roswaal import")} ${dim(placePath)}`);

	const existing = await fs.readdir(root).catch(() => null);
	if (existing !== null && existing.length > 0) {
		console.log(
			red(
				`  ${root} already has files in it. Import makes a new project; name an empty directory.`,
			),
		);
		return 1;
	}

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await fs.readFile(placePath));
	} catch {
		console.log(red(`  cannot read ${placePath}`));
		return 1;
	}
	let doc;
	try {
		doc = readRbx(bytes);
	} catch (err) {
		console.log(red(`  ${errorMessage(err)}`));
		return 1;
	}
	const survey = surveyPlace(doc);
	const placeFile = `${stem}${ext || ".rbxl"}`;
	const plan = planImport(survey, {
		scope,
		dedupe: args.flags["no-merge"] !== true,
		outDir: "src",
		placeFile,
		// The map and the Rojo project are named after the project, as Rojo
		// names a project after its folder -- not after the place file, which
		// is most often just `place`.
		name: path.basename(root),
	});

	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(path.join(root, placeFile), bytes);
	const map = await writePlaceImport(root, plan.files, placeFile);

	const luau = Object.keys(plan.files).filter((f) => f.endsWith(".luau"));
	const placeOnly = luau.filter((f) => f.startsWith("place/")).length;
	console.log(
		`  ${green("scripts ")} ${survey.scripts.length} in the place, ${luau.length} files written`,
	);
	console.log(
		`  ${green("rojo    ")} ${luau.length - placeOnly} under src/, mapped in default.project.json`,
	);
	if (scope === "all") {
		console.log(`  ${green("place   ")} ${placeOnly} under place/, for scripts Rojo cannot sync`);
	} else if (plan.skipped.length > 0) {
		console.log(
			`  ${yellow("left    ")} ${plan.skipped.length} only the place can hold; --scripts all brings them in`,
		);
	}
	if (!map.written)
		console.log(`  ${yellow("map     ")} ${map.skipped ?? "default.project.json was not written"}`);
	console.log(`  ${green("created ")} ${root}`);
	console.log("");
	console.log(dim(`  Next: cd ${path.relative(launchedFrom, root) || "."} && roswaal serve`));
	return map.written ? 0 : 1;
}

async function commandExport(args: Args): Promise<number> {
	const root = resolveRoot(args);
	const launchedFrom = process.env.ROSWAAL_CWD ?? process.cwd();
	const given = args.positional[1];
	if (!given) {
		console.log(red("roswaal export needs somewhere to write: roswaal export <place.rbxl>"));
		return 2;
	}
	const target = path.resolve(launchedFrom, given);
	console.log(`${bold("roswaal export")} ${dim(root)}`);

	let written;
	try {
		written = await exportPlace(await openProject(root));
	} catch (err) {
		console.log(red(`  ${errorMessage(err)}`));
		return 1;
	}
	if (!written) {
		console.log(
			red("  This project has no place file: set `place` in roswaal.json, or put one in its root."),
		);
		return 1;
	}
	const extension = path.extname(written.file).toLowerCase();
	if (path.extname(target).toLowerCase() !== extension) {
		console.log(red(`  The place is ${extension}; write it to a ${extension} file.`));
		return 2;
	}
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, written.bytes);

	const { title, detail } = describePlaceReport(written.file, placeReport(written.update));
	console.log(`  ${green("wrote   ")} ${target}`);
	console.log(`  ${title}.`);
	console.log(dim(`  ${detail}`));
	return 0;
}

async function commandServe(args: Args): Promise<number> {
	const root = resolveRoot(args);
	const port = flagNumber(args, "port", DEFAULT_PORT);

	const existing = await probeDaemon(port);
	if (existing !== null) {
		console.log(red(`a daemon is already running on :${port}`));
		console.log(dim(`  it is serving ${existing.project ?? "no project"}`));
		console.log(dim("  use `roswaal restart`, `roswaal stop`, or pass --port for a second one"));
		return 1;
	}

	const project = await projectHere(root);
	if (!project) return 1;

	await createDaemon().start({ port, root });

	const url = `http://127.0.0.1:${port}`;
	// A packaged build has no editor beside it, and saying "editor <url>" over
	// a URL that answers 404 is worse than not offering one. The API is still
	// there, which is what a compile-in-CI install actually wants.
	const editor = hasBundledEditor();
	banner([
		`${bold("roswaal")} ${dim("v" + VERSION)}`,
		`project   ${path.basename(project.root)}`,
		`root      ${project.root}`,
		`graphs    ${project.config.sourceDir}  →  ${project.config.outDir}`,
		`mode      ${project.config.compileMode}`,
		editor
			? `editor    ${cyan(url)}`
			: `editor    ${dim("not in this build — install Roswaal from npm for the editor")}`,
		// The documentation is the same daemon; said here, because otherwise it
		// is reachable only from a button inside the editor.
		...(editor ? [`docs      ${cyan(`${url}/docs`)}`] : []),
	]);
	if (project.packErrors.length > 0) {
		for (const message of project.packErrors) console.log(yellow(`  node pack: ${message}`));
	}
	if (args.flags["no-open"] !== true && editor) {
		// Windows terminals want Ctrl+Click for a link, and neither PowerShell nor
		// cmd.exe says so anywhere.
		console.log(dim("  Ctrl+Click to open the editor URL above; Ctrl+C stops the daemon"));
	}

	exitOnInterrupt(`stopped the daemon on :${port}`);

	// start() resolves once the socket is listening, but the process should
	// stay alive; the open server handle does that on its own.
	await new Promise<never>(() => {});
	return 0;
}

async function commandStop(args: Args): Promise<number> {
	const port = flagNumber(args, "port", DEFAULT_PORT);
	const result = await stopDaemon(port);

	if (result === "stopped") {
		console.log(green(`stopped the daemon on :${port}`));
		return 0;
	}
	if (result === "none") {
		// Not an error: "already off" is the state the caller asked for.
		console.log(dim(`no daemon running on :${port}`));
		return 0;
	}
	console.log(red(`the daemon on :${port} did not stop`));
	console.log(dim("  it may be an older build without a shutdown route"));
	console.log(dim("  close the terminal running `roswaal serve`"));
	return 1;
}

async function commandRestart(args: Args): Promise<number> {
	const port = flagNumber(args, "port", DEFAULT_PORT);
	const result = await stopDaemon(port);
	if (result === "failed") {
		console.log(red(`the daemon on :${port} did not stop; not restarting`));
		console.log(dim("  carrying on would try to bind a port that is still held"));
		return 1;
	}
	if (result === "stopped") console.log(green(`stopped the daemon on :${port}`));
	return commandServe(args);
}

async function commandStatus(args: Args): Promise<number> {
	const port = flagNumber(args, "port", DEFAULT_PORT);
	const health = await probeDaemon(port);
	if (health === null) {
		console.log(dim(`no daemon running on :${port}`));
		return 0;
	}
	console.log(green(`daemon running on :${port}`));
	console.log(`  ${"project".padEnd(10)} ${health.project ?? dim("none open")}`);
	console.log(`  ${"version".padEnd(10)} ${health.version ?? dim("unknown")}`);
	return 0;
}

/**
 * What `roswaal compile` was asked to compile: one map, one graph, or -- with
 * no target -- every map and every graph.
 */
async function compileTargets(
	project: OpenProject,
	target: string | undefined,
): Promise<{ maps: string[]; graph?: string }> {
	if (target === undefined) return { maps: await collectMaps(project) };
	// A target ending in .nodemap compiles to a Rojo project file rather than Luau.
	if (target.endsWith(".nodemap")) return { maps: [target] };
	return { maps: [], graph: target };
}

async function commandCompile(args: Args): Promise<number> {
	const root = resolveRoot(args);
	const force = args.flags.force === true;
	const target = args.positional[1];

	const project = await projectHere(root);
	if (!project) return 1;

	const { maps, graph } = await compileTargets(project, target);
	const merge = args.flags.merge === true;

	// Counted apart, because the summary needs them apart: a skipped script
	// must not take a written map off the total.
	let mapFailures = 0;
	let scriptFailures = 0;

	// Maps before graphs: a synced folder whose path changed moves with its
	// graphs, and they then compile where they are going to stay.
	for (const mapPath of maps) {
		const outcome = await compileMap(project, mapPath, { write: true, force, merge });
		for (const move of outcome.moved ?? []) {
			console.log(
				`${green("moved   ")} ${move.from}/ -> ${move.to}/ ${dim(`(${move.name}, with its graphs)`)}`,
			);
			for (const file of move.kept)
				console.log(`${yellow("kept    ")} ${file} ${dim("the new folder has one of that name")}`);
		}
		for (const move of outcome.held ?? []) {
			console.log(`${yellow("held    ")} ${move.from}/ -> ${move.to}/ ${dim(`(${move.name})`)}`);
			console.log(
				dim("           The new folder already has files. Compile with --merge to move into it."),
			);
		}
		if (outcome.unchanged) {
			console.log(
				`${green("same    ")} ${outcome.outputPath} ${dim("already says this; left as it is")}`,
			);
		} else if (outcome.written) {
			console.log(`${green("wrote   ")} ${outcome.outputPath}`);
		} else {
			mapFailures++;
			console.log(`${yellow("skipped ")} ${mapPath}`);
			if (outcome.skipped) console.log(dim(`           ${outcome.skipped}`));
		}
		for (const diagnostic of outcome.diagnostics) {
			if (diagnostic.severity !== "error") continue;
			console.log(`${red("error   ")} ${mapPath}: ${diagnostic.message}`);
		}
	}

	let results: CompileOutcome[];
	if (graph !== undefined) results = [await compileScript(project, graph, { write: true, force })];
	else if (target === undefined) results = await compileAll(project, { write: true, force });
	else results = [];

	for (const result of results) {
		// The verdict the editor's compile panel shows, so the two agree.
		const { state, note } = describeOutcome(result);
		if (state === "wrote") {
			console.log(`${green("wrote   ")} ${result.outputPath}`);
			for (const gone of result.superseded ?? []) console.log(`${dim("removed ")} ${gone}`);
		} else if (state === "skipped" || state === "failed") {
			scriptFailures++;
			console.log(`${yellow(state.padEnd(8))} ${result.scriptPath}`);
			if (note) console.log(dim(`           ${note}`));
		}
		for (const diagnostic of result.diagnostics) {
			if (diagnostic.severity !== "error") continue;
			console.log(`${red("error   ")} ${result.scriptPath}: ${diagnostic.message}`);
		}
	}

	if (results.length === 0 && maps.length === 0) {
		console.log(dim(`nothing to compile in ${project.config.sourceDir}`));
		return 0;
	}
	const written = results.filter((r) => r.written).length + (maps.length - mapFailures);
	const total = results.length + maps.length;
	console.log("");
	console.log(dim(`  ${written} of ${total} written`));
	return mapFailures + scriptFailures > 0 ? 1 : 0;
}

async function commandWatch(args: Args): Promise<number> {
	const project = await projectHere(resolveRoot(args));
	if (!project) return 1;

	const dynamic = new DynamicCompiler();
	dynamic.subscribe((event) => {
		const stamp = dim(new Date().toTimeString().slice(0, 8));
		if (event.type === "error") {
			console.log(`${stamp} ${red("error")}  ${event.path}: ${event.message}`);
		} else if (event.type === "removed") {
			console.log(`${stamp} ${dim("gone")}   ${event.path}`);
		} else if (event.outcome?.written) {
			console.log(`${stamp} ${green("wrote")}  ${event.outcome.outputPath}`);
			for (const gone of event.outcome.superseded ?? []) {
				console.log(`${stamp} ${dim("gone")}   ${gone}`);
			}
		} else if (event.outcome?.skipped) {
			console.log(`${stamp} ${yellow("skip")}   ${event.path}: ${event.outcome.skipped}`);
		}
	});
	dynamic.start(project);

	console.log(`${bold("roswaal watch")} ${dim(project.config.sourceDir)}`);
	console.log(dim("  Ctrl+C to stop"));
	exitOnInterrupt("stopped watching");
	await new Promise<never>(() => {});
	return 0;
}

async function commandPrune(args: Args): Promise<number> {
	const project = await projectHere(resolveRoot(args));
	if (!project) return 1;

	const orphans = await findOrphanOutputs(project);
	if (orphans.length === 0) {
		console.log(dim("nothing to prune"));
		return 0;
	}

	for (const orphan of orphans) console.log(`${yellow("orphan  ")} ${orphan}`);
	console.log("");

	// Deleting files is not something to do because a command was typed
	// vaguely; --yes is the developer saying they read the list.
	if (args.flags.yes !== true) {
		console.log(dim(`  ${orphans.length} file(s) above have no graph behind them.`));
		console.log(dim("  Run `roswaal prune --yes` to delete them."));
		return 0;
	}

	const removed = await removeOutputs(project, orphans);
	console.log(green(`removed ${removed} file(s)`));
	return 0;
}

/**
 * Deliberately plain: aligned `key: value` lines, no colour, no box. This is
 * the command a script or an agent reads.
 */
async function commandCheck(args: Args): Promise<number> {
	const root = resolveRoot(args);
	const port = flagNumber(args, "port", DEFAULT_PORT);

	console.log(`version: ${VERSION}`);
	console.log(`root: ${root}`);

	try {
		const project = await openProject(root);
		console.log(`project: ${project.initialised ? "ok" : "not initialised (no roswaal.json)"}`);
		console.log(`source: ${project.config.sourceDir}`);
		console.log(`out: ${project.config.outDir}`);
		console.log(`mode: ${project.config.compileMode}`);
		console.log(`node packs: ${project.packCount}`);
		console.log(`pack errors: ${project.packErrors.length}`);
	} catch (err) {
		console.log(`project: ${errorMessage(err)}`);
	}

	const health = await probeDaemon(port);
	console.log(`daemon: ${health ? `running on :${port}` : `not running on :${port}`}`);
	return 0;
}

// ---------------------------------------------------------------------------

function printHelp(topic?: string): void {
	for (const line of helpLines(topic)) console.log(line);
}

async function main(): Promise<number> {
	const { command, topic, args } = parseInvocation(process.argv.slice(2));

	switch (command) {
		case "new":
			return commandNew(args);
		case "init":
			return commandInit(args);
		case "import":
			return commandImport(args);
		case "export":
			return commandExport(args);
		case "serve":
			return commandServe(args);
		case "stop":
			return commandStop(args);
		case "restart":
			return commandRestart(args);
		case "status":
			return commandStatus(args);
		case "compile":
			return commandCompile(args);
		case "watch":
			return commandWatch(args);
		case "prune":
			return commandPrune(args);
		case "check":
			return commandCheck(args);
		case "help":
			printHelp(topic);
			return 0;
		case "version":
			console.log(VERSION);
			return 0;
		default:
			console.log(red(`unknown command \`${command}\``));
			console.log("");
			printHelp();
			return 1;
	}
}

main().then(
	(code) => process.exit(code),
	(err: unknown) => {
		console.error(red(errorMessage(err)));
		process.exit(1);
	},
);
