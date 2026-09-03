/**
 * Forward migration for graphs written by earlier builds.
 *
 * Runs on every read. Cheap, idempotent, and the only place that knows about
 * historical shapes, so the rest of the codebase can assume the current one.
 */

import { RENAMED_NODES } from "./nodes/index.js";
import { emptyScript, SCHEMA_VERSION, type NodeScript } from "./schema.js";

export interface MigrationResult {
	script: NodeScript;
	/** Human-readable notes, shown once when the file is opened. */
	notes: string[];
}

export function migrateScript(raw: NodeScript): MigrationResult {
	const notes: string[] = [];

	// Defaults for fields added after this file was written.
	const script: NodeScript = {
		...emptyScript(raw.name, raw.id),
		...raw,
		variables: raw.variables ?? [],
		comments: raw.comments ?? [],
		links: raw.links ?? [],
		nodes: raw.nodes ?? [],
	};

	const renamed = new Map<string, number>();
	script.nodes = script.nodes.map((node) => {
		const replacement = RENAMED_NODES[node.def];
		if (!replacement) return node;
		renamed.set(node.def, (renamed.get(node.def) ?? 0) + 1);
		return { ...node, def: replacement };
	});

	for (const [from, count] of renamed) {
		notes.push(`Renamed ${count} × "${from}" to "${RENAMED_NODES[from]}".`);
	}

	if (script.schemaVersion < SCHEMA_VERSION) {
		notes.push(`Updated from schema ${script.schemaVersion} to ${SCHEMA_VERSION}.`);
		script.schemaVersion = SCHEMA_VERSION;
	}

	return { script, notes };
}
