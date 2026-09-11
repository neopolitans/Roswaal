/**
 * Dynamic compiling.
 *
 * Watches the graph directory and recompiles what changed. This is the same
 * compileScript() the manual button calls — Dynamic is a trigger, not a
 * second code path, which is why the two cannot drift.
 *
 * The stored setting is still `compileMode: "hot"`, because a `roswaal.json` is
 * committed and shared: renaming what a person reads costs nothing, renaming
 * what is written to disk would invalidate every project file already out
 * there. The two names meet here and nowhere else.
 *
 * The watcher matters even though the editor already compiles on save: it
 * catches changes Roswaal did not make. Switching branches, pulling, or
 * editing a .nodescript in another tool all regenerate the Luau without
 * anybody pressing anything.
 */

import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";

import { compileScript, type CompileOutcome, type OpenProject } from "./project.js";

/** Long enough to coalesce a save, short enough to feel immediate. */
const DEBOUNCE_MS = 200;

export type WatchListener = (event: WatchEvent) => void;

export interface WatchEvent {
	type: "compiled" | "removed" | "error";
	path: string;
	outcome?: CompileOutcome;
	message?: string;
}

export class DynamicCompiler {
	private watcher: FSWatcher | null = null;
	private timers = new Map<string, NodeJS.Timeout>();
	private listeners = new Set<WatchListener>();

	subscribe(listener: WatchListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get running(): boolean {
		return this.watcher !== null;
	}

	start(project: OpenProject): void {
		this.stop();
		const dir = path.join(project.root, project.config.sourceDir);

		this.watcher = chokidar.watch(dir, {
			ignoreInitial: true,
			// A file being written is reported as several events; wait until the
			// size has settled so we never compile a half-written graph.
			awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
		});

		this.watcher.on("add", (file) => this.schedule(project, file));
		this.watcher.on("change", (file) => this.schedule(project, file));
		this.watcher.on("unlink", (file) => {
			this.emit({ type: "removed", path: relative(project, file) });
		});
		this.watcher.on("error", (err) => {
			this.emit({ type: "error", path: dir, message: (err as Error).message });
		});
	}

	stop(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		void this.watcher?.close();
		this.watcher = null;
	}

	private schedule(project: OpenProject, file: string): void {
		if (!file.endsWith(".nodescript")) return;
		const rel = relative(project, file);

		const existing = this.timers.get(rel);
		if (existing) clearTimeout(existing);

		this.timers.set(
			rel,
			setTimeout(() => {
				this.timers.delete(rel);
				void this.run(project, rel);
			}, DEBOUNCE_MS),
		);
	}

	private async run(project: OpenProject, rel: string): Promise<void> {
		try {
			// Never force. A generated file edited by hand is still refused in hot
			// mode; the editor surfaces it and the developer decides.
			const outcome = await compileScript(project, rel, { write: true });
			this.emit({ type: "compiled", path: rel, outcome });
		} catch (err) {
			this.emit({ type: "error", path: rel, message: (err as Error).message });
		}
	}

	private emit(event: WatchEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}

function relative(project: OpenProject, file: string): string {
	return path.relative(project.root, file).split(path.sep).join("/");
}
