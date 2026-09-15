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

export async function recordGenerated(
	root: string, outputPath: string, sourcePath: string,
): Promise<void> {
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
