/**
 * The roswaal command line.
 *
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
 * Shaped after Rojo's CLI, and after beako's, on purpose: `roswaal serve` in a
 * project directory should feel like `rojo serve` does, because it sits beside
 * it in the same workflow and a tool that invents its own conventions makes you
 * learn twice.
 *
 * `stop` and `restart` reach a running daemon over HTTP rather than through a
 * PID file — see POST /api/shutdown for why.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_PORT, hasBundledEditor, startDaemon } from "../server/app.js";
import {
	collectMaps, compileAll, compileMap, compileScript, findOrphanOutputs,
	openProject, removeOutputs, writeConfig,
} from "../server/project.js";
import { CLI_COMMANDS, CLI_OPTIONS } from "../core/docs/cli.js";
import { defaultConfig } from "../core/schema.js";
import { DynamicCompiler } from "../server/watcher.js";
import { EXAMPLE_PACK } from "./examplePack.js";
import { banner, bold, cyan, dim, green, red, yellow } from "./style.js";
import { VERSION } from "./version.js";

const HEALTH_TIMEOUT_MS = 1500;
const STOP_TIMEOUT_MS = 5000;
const STOP_POLL_MS = 150;

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

/**
 * The commands and options, from the one list the documentation renders too.
 *
 * They were written out here and described again on no page at all, which is
 * how `--yes` came to be missing from this output while the tool had it.
 */
const COMMANDS = CLI_COMMANDS;
const OPTIONS = CLI_OPTIONS;

function printHelp(): void {
	console.log(`${bold("roswaal")} — visual scripting for Roblox Luau, and Lune Luau (experimental)`);
	console.log(dim(`v${VERSION}`));
	console.log("");
	console.log(bold("USAGE"));
	console.log("  roswaal <command> [options]");
	console.log("");
	console.log(bold("COMMANDS"));
	for (const command of COMMANDS) {
		console.log(`  ${cyan(command.name.padEnd(10))} ${command.blurb}`);
	}
	console.log("");
	console.log(bold("OPTIONS"));
	for (const option of OPTIONS) {
		console.log(`  ${option.flag.padEnd(16)} ${option.blurb}`);
	}
	console.log("");
	console.log(dim("  Graphs live in .roswaal/scripts and compile to the outDir in roswaal.json."));
	console.log(dim("  Rojo syncs the result; Roswaal never talks to Studio itself."));
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
	positional: string[];
	flags: Record<string, string | boolean>;
}

/**
 * Hand-rolled, about twenty lines, and supports the three forms anyone
 * actually types: `--key value`, `--key=value`, and a bare `--flag`.
 */
function parseArgs(argv: string[]): Args {
	const positional: string[] = [];
	const flags: Record<string, string | boolean> = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const body = arg.slice(2);
		const eq = body.indexOf("=");
		if (eq !== -1) {
			flags[body.slice(0, eq)] = body.slice(eq + 1);
			continue;
		}
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith("--")) {
			flags[body] = next;
			i++;
		} else {
			flags[body] = true;
		}
	}
	return { positional, flags };
}

function flagString(args: Args, name: string): string | undefined {
	const value = args.flags[name];
	return typeof value === "string" ? value : undefined;
}

/**
 * Accepts a number from either the command line (a string) or a config file (a
 * number), because reading only one of those is a bug that hides for months.
 */
function flagNumber(args: Args, name: string, fallback: number): number {
	const value = args.flags[name];
	const parsed = typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveRoot(args: Args): string {
	// The shim records where the user actually was, because it may have changed
	// directory to find the tool's own files.
	const launchedFrom = process.env.ROSWAAL_CWD ?? process.cwd();
	const given = flagString(args, "root");
	return given ? path.resolve(launchedFrom, given) : launchedFrom;
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

async function commandInit(args: Args): Promise<number> {
	const root = resolveRoot(args);
	console.log(`${bold("roswaal init")} ${dim(root)}`);

	const config = defaultConfig();
	const ledger: string[] = [];

	const record = async (relPath: string, make: () => Promise<void>) => {
		const abs = path.join(root, relPath);
		if (await exists(abs)) {
			ledger.push(`${dim("kept    ")} ${relPath}`);
			return;
		}
		await make();
		ledger.push(`${green("created ")} ${relPath}`);
	};

	await record("roswaal.json", () => writeConfig(root, config));
	await record(config.sourceDir, async () => {
		await fs.mkdir(path.join(root, config.sourceDir), { recursive: true });
	});
	await record(config.nodePaths[0], async () => {
		await fs.mkdir(path.join(root, config.nodePaths[0]), { recursive: true });
	});
	await record(".roswaal/nodes/example.nodedef.luau", () =>
		fs.writeFile(path.join(root, ".roswaal/nodes/example.nodedef.luau"), EXAMPLE_PACK, "utf8"),
	);

	for (const line of ledger) console.log(`  ${line}`);
	console.log("");
	console.log(dim("  Next: roswaal serve"));
	console.log(dim("  Graphs are committed. Generated Luau goes to " + config.outDir + "."));
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

	let project;
	try {
		project = await openProject(root);
	} catch (err) {
		console.log(red(`could not open ${root}`));
		console.log(dim(`  ${(err as Error).message}`));
		console.log(dim("  run `roswaal init` here first"));
		return 1;
	}

	await startDaemon({ port, root });

	const url = `http://127.0.0.1:${port}`;
	/**
	 * A packaged build has no editor beside it, and saying "editor <url>" over
	 * a URL that answers 404 is worse than not offering one. The API is still
	 * there, which is what a compile-in-CI install actually wants.
	 */
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
		// The documentation is the same daemon, and nothing said so: it was
		// reachable only from a button inside the editor you had not opened yet.
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

	// startDaemon resolves once the socket is listening, but the process should
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

async function commandCompile(args: Args): Promise<number> {
	const root = resolveRoot(args);
	const force = args.flags.force === true;
	const target = args.positional[1];

	let project;
	try {
		project = await openProject(root);
	} catch (err) {
		console.log(red((err as Error).message));
		return 1;
	}

	// A target ending in .nodemap compiles to a Rojo project file rather than
	// Luau; with no target, both kinds are compiled.
	const mapTargets = target
		? target.endsWith(".nodemap") ? [target] : []
		: await collectMaps(project);
	const scriptResults = target && !target.endsWith(".nodemap")
		? [await compileScript(project, target, { write: true, force })]
		: target
			? []
			: await compileAll(project, { write: true, force });

	const results = scriptResults;
	/**
	 * Counted apart, because the summary needs them apart. They used to share
	 * one `failures`, which was then subtracted from the *map* count — so a
	 * skipped script quietly took a written map off the total, and a compile
	 * that wrote two files could report "0 of 5 written". Invisible while skips
	 * were rare; the output-collision refusal made them ordinary.
	 */
	let mapFailures = 0;
	let scriptFailures = 0;

	for (const mapPath of mapTargets) {
		const outcome = await compileMap(project, mapPath, { write: true, force });
		if (outcome.written) {
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

	for (const result of results) {
		const errors = result.diagnostics.filter((d) => d.severity === "error");
		if (result.written) {
			console.log(`${green("wrote   ")} ${result.outputPath}`);
			for (const gone of result.superseded ?? []) console.log(`${dim("removed ")} ${gone}`);
		} else if (result.skipped) {
			scriptFailures++;
			console.log(`${yellow("skipped ")} ${result.scriptPath}`);
			console.log(dim(`           ${result.skipped}`));
		}
		for (const diagnostic of errors) {
			console.log(`${red("error   ")} ${result.scriptPath}: ${diagnostic.message}`);
		}
	}

	if (results.length === 0 && mapTargets.length === 0) {
		console.log(dim(`nothing to compile in ${project.config.sourceDir}`));
		return 0;
	}
	const written = results.filter((r) => r.written).length + (mapTargets.length - mapFailures);
	const total = results.length + mapTargets.length;
	console.log("");
	console.log(dim(`  ${written} of ${total} written`));
	return mapFailures + scriptFailures > 0 ? 1 : 0;
}

async function commandWatch(args: Args): Promise<number> {
	const root = resolveRoot(args);
	let project;
	try {
		project = await openProject(root);
	} catch (err) {
		console.log(red((err as Error).message));
		return 1;
	}

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
	const root = resolveRoot(args);
	let project;
	try {
		project = await openProject(root);
	} catch (err) {
		console.log(red((err as Error).message));
		return 1;
	}

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
		console.log(`project: ok`);
		console.log(`source: ${project.config.sourceDir}`);
		console.log(`out: ${project.config.outDir}`);
		console.log(`mode: ${project.config.compileMode}`);
		console.log(`node packs: ${project.packCount}`);
		console.log(`pack errors: ${project.packErrors.length}`);
	} catch (err) {
		console.log(`project: ${(err as Error).message}`);
	}

	const health = await probeDaemon(port);
	console.log(`daemon: ${health ? `running on :${port}` : `not running on :${port}`}`);
	return 0;
}

// ---------------------------------------------------------------------------

async function exists(abs: string): Promise<boolean> {
	return fs.access(abs).then(() => true, () => false);
}

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));
	const command = args.positional[0] ?? "help";

	switch (command) {
		case "init": return commandInit(args);
		case "serve": return commandServe(args);
		case "stop": return commandStop(args);
		case "restart": return commandRestart(args);
		case "status": return commandStatus(args);
		case "compile": return commandCompile(args);
		case "watch": return commandWatch(args);
		case "prune": return commandPrune(args);
		case "check": return commandCheck(args);
		case "help":
		case "--help":
		case "-h":
			printHelp();
			return 0;
		case "version":
		case "--version":
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
	(err: Error) => {
		console.error(red(err.message));
		process.exit(1);
	},
);
