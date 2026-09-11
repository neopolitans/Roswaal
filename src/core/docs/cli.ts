/**
 * The command line, as data.
 *
 * One list, read twice: `roswaal help` prints it, and the CLI page in the
 * documentation renders it. It was only in `src/cli/index.ts`, so the docs had
 * no way to describe the commands without a second copy of them — and a second
 * copy is how `--yes` came to exist for a year without appearing in the help
 * output at all.
 *
 * In core because the docs are built here and `src/core` imports nothing
 * platform-specific; the CLI imports this rather than the other way round.
 */

export interface CliCommand {
	name: string;
	/** One line, as it reads in the help output. */
	blurb: string;
	/** What it is for, on the documentation page only. Help stays one line. */
	detail?: string;
	/** Keeps running until it is stopped, which the page says out loud. */
	blocks?: boolean;
}

export interface CliOption {
	flag: string;
	blurb: string;
}

export const CLI_COMMANDS: CliCommand[] = [
	{
		name: "init",
		blurb: "Create roswaal.json and .roswaal/ in this project. Like `rojo init`.",
		detail:
			"Writes `roswaal.json`, the graph and node-pack directories, and a commented example " +
			"pack. Anything already there is kept rather than overwritten.",
	},
	{
		name: "serve",
		blurb: "Start the daemon and serve the editor. Blocks.",
		blocks: true,
		detail:
			"The editor at `http://127.0.0.1:4471`, the documentation at `/docs`, and — in hot " +
			"mode — a watcher recompiling graphs as they change.",
	},
	{ name: "stop", blurb: "Stop a running daemon on this port.", detail: "Over HTTP rather than a PID file, and it reports success only once the daemon has actually gone quiet." },
	{ name: "restart", blurb: "Stop a running daemon, then serve again.", blocks: true, detail: "What to run after rebuilding: `serve` loads the CLI bundle once, so a rebuild does not reach a daemon that is already up." },
	{ name: "status", blurb: "Is a daemon running here, and what is it serving?" },
	{
		name: "compile",
		blurb: "Compile every graph and map once and exit. Takes an optional path.",
		detail:
			"One path compiles one document. A generated file somebody has edited by hand is " +
			"refused rather than overwritten — pass `--force` to take it back.",
	},
	{
		name: "watch",
		blurb: "Recompile graphs as they change, without the editor. Blocks.",
		blocks: true,
		detail: "The same compile the editor runs, for working in a text editor beside Rojo.",
	},
	{
		name: "prune",
		blurb: "Remove generated files whose graph has moved or gone.",
		detail:
			"Lists what it would delete and stops. `--yes` is you saying you have read the list.",
	},
	{
		name: "check",
		blurb: "One-shot health probe. Plain output, good for scripts.",
		detail: "Aligned `key: value` lines, no colour and no box: this is the one a script reads.",
	},
	{
		name: "version",
		blurb: "Print the version and exit.",
		detail: "The number alone, for a script that needs to know which build it is talking to.",
	},
	{ name: "help", blurb: "This list." },
];

export const CLI_OPTIONS: CliOption[] = [
	{ flag: "--root <path>", blurb: "Project directory. Default: the current directory." },
	// The number is written out rather than interpolated: the daemon's own
	// default lives in `src/server`, which core does not import. A test holds
	// this line against it, which is the cheaper half of the same guarantee.
	{ flag: "--port <n>", blurb: "HTTP port for the daemon. Default: 4471." },
	{ flag: "--force", blurb: "For compile: overwrite generated files edited by hand." },
	{ flag: "--no-open", blurb: "For serve: do not print the editor URL as a hint." },
	{ flag: "--yes", blurb: "For prune: delete the files it lists, rather than only listing them." },
];
