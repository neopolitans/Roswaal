/**
 * The place editor's worker: work on a place that needs nothing but numbers,
 * done off the page so the editor keeps answering while a place loads. Today
 * that is the lights' grid, the slowest of it by far. See `prepare.ts`.
 *
 * Unlike most modules, this one runs when it is loaded: it is the worker's
 * entry point.
 */

/// <reference lib="webworker" />

import { lightGrid } from "./view.js";

export type SceneJob = { id: number; lights: number[] };
export type SceneAnswer =
	| { id: number; table: Uint32Array; index: Uint32Array }
	| { id: number; failed: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<SceneJob>) => {
	const { id, lights } = e.data;
	try {
		const { table, index } = lightGrid(lights);
		const answer: SceneAnswer = { id, table, index };
		scope.postMessage(answer, [table.buffer, index.buffer]);
	} catch (err) {
		const answer: SceneAnswer = { id, failed: String(err) };
		scope.postMessage(answer);
	}
};
