/**
 * Which generated files Roswaal owns.
 *
 * Generated Luau records its own provenance in a header comment, which works
 * because Lua has comments. A Rojo project file is JSON, which does not — and
 * Rojo rejects a project containing any key it does not recognise, so an
 * ownership marker cannot live inside the document either. It lives here
 * instead, beside the graphs, in a file only Roswaal reads.
 */

import { fs, path } from "./host.js";

const MANIFEST_PATH = ".roswaal/generated.json";
const SCHEMA_VERSION = 1;

export interface GeneratedManifest {
	schemaVersion: number;
	/** Output path (project-relative) -> the source that produced it. */
	outputs: Record<string, string>;
}

function empty(): GeneratedManifest {
	return { schemaVersion: SCHEMA_VERSION, outputs: {} };
}

export async function readManifest(root: string): Promise<GeneratedManifest> {
	const raw = await fs.readFile(path.join(root, MANIFEST_PATH), "utf8").catch(() => null);
	if (raw === null) return empty();
	try {
		const parsed = JSON.parse(raw) as Partial<GeneratedManifest>;
		return { ...empty(), ...parsed, outputs: parsed.outputs ?? {} };
	} catch {
		// A corrupt manifest must not block compiling. Losing it costs one
		// confirmation the next time a file would be overwritten.
		return empty();
	}
}

/**
 * The write in progress for each project, so the next waits for it.
 *
 * Recording is read, change, write. Two compiles at once -- the watcher and a
 * button press, or two maps compiled together -- each read the manifest before
 * either wrote it, and whichever wrote second lost the other's entry. Queued
 * per root, each record reads what the one before it wrote.
 */
const writing = new Map<string, Promise<void>>();

/** Records that `outputPath` was generated from `sourcePath`. One write at a time per project. */
export function recordGenerated(
	root: string,
	outputPath: string,
	sourcePath: string,
): Promise<void> {
	const before = writing.get(root) ?? Promise.resolve();
	// A failed record is reported to its own caller below; the next one still runs.
	const next = before.catch(() => undefined).then(() => record(root, outputPath, sourcePath));
	writing.set(root, next);
	// Forgotten once it is the last in line, so the map does not keep every root ever seen.
	const forget = () => {
		if (writing.get(root) === next) writing.delete(root);
	};
	next.then(forget, forget);
	return next;
}

async function record(root: string, outputPath: string, sourcePath: string): Promise<void> {
	const manifest = await readManifest(root);
	if (manifest.outputs[outputPath] === sourcePath) return;

	manifest.outputs[outputPath] = sourcePath;
	const ordered: Record<string, string> = {};
	for (const key of Object.keys(manifest.outputs).sort()) ordered[key] = manifest.outputs[key];

	const file = path.join(root, MANIFEST_PATH);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(
		file,
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, outputs: ordered }, null, 2) + "\n",
		"utf8",
	);
}

export async function isGenerated(root: string, outputPath: string): Promise<boolean> {
	const manifest = await readManifest(root);
	return outputPath in manifest.outputs;
}
