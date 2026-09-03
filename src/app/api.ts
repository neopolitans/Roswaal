/** Thin wrapper over the daemon's HTTP API. */

import type { NodeDef, NodeScript, RoswaalConfig, ScriptClass } from "../core/schema.js";
import type { Diagnostic } from "../core/compiler/index.js";

export interface TreeEntry {
	path: string;
	name: string;
	kind: "directory" | "nodescript" | "nodemap" | "luau";
	generatedFrom?: string;
	children?: TreeEntry[];
}

export interface ProjectInfo {
	root: string;
	config: RoswaalConfig;
	packErrors: string[];
	tree: TreeEntry[];
}

export interface CompileOutcome {
	scriptPath: string;
	outputPath: string;
	written: boolean;
	skipped?: string;
	diagnostics: Diagnostic[];
	sourceMap: { line: number; node: string }[];
	code: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		headers: { "Content-Type": "application/json" },
		...init,
	});
	const payload = await response.json().catch(() => ({ error: response.statusText }));
	if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Request failed");
	return payload as T;
}

const post = <T>(url: string, body: unknown) =>
	request<T>(url, { method: "POST", body: JSON.stringify(body) });

export const api = {
	health: () => request<{ ok: boolean; project: string | null }>("/api/health"),

	openProject: (root: string) => post<ProjectInfo>("/api/project/open", { root }),
	initProject: (root: string) => post<ProjectInfo>("/api/project/init", { root }),
	saveConfig: (config: RoswaalConfig) =>
		request<{ config: RoswaalConfig }>("/api/project/config", {
			method: "PUT",
			body: JSON.stringify(config),
		}),

	tree: () => request<{ tree: TreeEntry[] }>("/api/tree"),
	customNodes: () => request<{ custom: NodeDef[]; errors: string[] }>("/api/nodes"),

	readScript: (path: string) =>
		request<{ script: NodeScript }>(`/api/script?path=${encodeURIComponent(path)}`),
	writeScript: (path: string, script: NodeScript) =>
		request<{ ok: true }>("/api/script", {
			method: "PUT",
			body: JSON.stringify({ path, script }),
		}),
	createScript: (dir: string, name: string, scriptClass: ScriptClass) =>
		post<{ path: string; script: NodeScript }>("/api/script/create", { dir, name, scriptClass }),
	moveScript: (from: string, toDir: string) =>
		post<{ path: string }>("/api/script/move", { from, toDir }),
	deleteScript: (path: string) => post<{ ok: true }>("/api/script/delete", { path }),

	readSource: (path: string) =>
		request<{ text: string }>(`/api/source?path=${encodeURIComponent(path)}`),

	compile: (opts: { path?: string; write?: boolean; force?: boolean }) =>
		post<{ results: CompileOutcome[] }>("/api/compile", opts),
};
