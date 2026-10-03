/**
 * Reading the command line: the flags, and which command it asks for.
 *
 * Apart from `index.ts` so it can be tested: that module runs the command it
 * is given as soon as it is imported. Nothing here prints or touches the disk.
 */

export interface Args {
	positional: string[];
	flags: Record<string, string | boolean>;
}

/**
 * Flags that never take a value, so the word after one stays a positional:
 * `compile --force Main.nodescript` compiles that graph rather than reading
 * the path as what `--force` was set to. `--help` and `--version` are here so
 * `roswaal --help serve` asks about serve rather than setting help to "serve".
 */
const BOOLEAN_FLAGS = new Set(["force", "no-open", "yes", "no-merge", "help", "version"]);

/**
 * Hand-rolled, about twenty lines, and supports the three forms anyone
 * actually types: `--key value`, `--key=value`, and a bare `--flag`.
 */
export function parseArgs(argv: string[]): Args {
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
		if (!BOOLEAN_FLAGS.has(body) && next !== undefined && !next.startsWith("--")) {
			flags[body] = next;
			i++;
		} else {
			flags[body] = true;
		}
	}
	return { positional, flags };
}

/** What the command line asks for, once `--help` and `--version` are taken out. */
export interface Invocation {
	/** The command to run: `help` and `version` included. */
	command: string;
	/** For `help`: the command asked about, when one was. */
	topic?: string;
	args: Args;
}

/**
 * The command to run, with `--help`, `-h` and `--version` read first.
 *
 * Read before anything is dispatched, wherever they appear: `roswaal serve
 * --help` asking about serve must not start a daemon, and `roswaal init
 * --help` must not initialise the folder it was typed in. Help wins over
 * version, and both over the command they were typed after.
 */
export function parseInvocation(argv: string[]): Invocation {
	const args = parseArgs(argv);
	const named = args.positional[0];
	const wantsHelp = args.flags.help === true || args.positional.includes("-h");
	if (wantsHelp || named === "help") {
		const topic = named === "help" || named === "-h" ? args.positional[1] : named;
		return { command: "help", ...(topic !== undefined ? { topic } : {}), args };
	}
	if (args.flags.version === true || named === "version") return { command: "version", args };
	return { command: named ?? "help", args };
}

export function flagString(args: Args, name: string): string | undefined {
	const value = args.flags[name];
	return typeof value === "string" ? value : undefined;
}

/**
 * Accepts a number from either the command line (a string) or a config file (a
 * number), because reading only one of those is a bug that hides for months.
 */
export function flagNumber(args: Args, name: string, fallback: number): number {
	const value = args.flags[name];
	const parsed = typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}
