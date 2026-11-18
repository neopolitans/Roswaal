/**
 * A place made ready to draw before it reaches a renderer, the slow part in a
 * worker (`sceneWorker.ts`) so the page is not held while it is worked out.
 *
 * The renderers ask `lightGridFor` for the lights' grid, which answers with
 * the one made here when there is one and works it out on the spot when there
 * is not -- where there are no workers, or the worker failed -- so a place
 * draws the same either way, only sooner or later.
 */

import type { PlaceScene } from "../../core/scene.js";
import type { SceneAnswer, SceneJob } from "./sceneWorker.js";
import { lightGrid } from "./view.js";

type LightGrid = { table: Uint32Array; index: Uint32Array };

/** Each lights list's grid, for as long as the place holding the list is kept. */
const grids = new WeakMap<readonly number[], LightGrid>();

/** The grid for `lights`: the one made ahead, else made now. */
export function lightGridFor(lights: readonly number[] | undefined): LightGrid {
	if (!lights) return lightGrid(lights);
	let grid = grids.get(lights);
	if (!grid) {
		grid = lightGrid(lights);
		grids.set(lights, grid);
	}
	return grid;
}

let worker: Worker | null | undefined;
let jobs = 0;
const waiting = new Map<number, (answer: SceneAnswer) => void>();

function sceneWorker(): Worker | null {
	if (worker !== undefined) return worker;
	if (typeof Worker !== "function") return (worker = null);
	try {
		worker = new Worker(new URL("./sceneWorker.js", import.meta.url), {
			type: "module",
			name: "roswaal-place-viewer",
		});
		worker.onmessage = (e: MessageEvent<SceneAnswer>) => {
			waiting.get(e.data.id)?.(e.data);
			waiting.delete(e.data.id);
		};
		worker.onerror = () => {
			// Not loaded, or broken: what was asked of it is made on the page.
			worker?.terminate();
			worker = null;
			for (const [id, resolve] of waiting) resolve({ id, failed: "the worker stopped" });
			waiting.clear();
		};
	} catch {
		worker = null;
	}
	return worker;
}

/** Works out what `scene` will be drawn with, off the page where it can. Never fails. */
export async function prepareScene(scene: PlaceScene): Promise<void> {
	const lights = scene.lights;
	if (!lights || lights.length === 0 || grids.has(lights)) return;
	const to = sceneWorker();
	if (!to) return;
	const id = ++jobs;
	const answer = await new Promise<SceneAnswer>((resolve) => {
		waiting.set(id, resolve);
		const job: SceneJob = { id, lights };
		to.postMessage(job);
	});
	if ("table" in answer) grids.set(lights, { table: answer.table, index: answer.index });
}
