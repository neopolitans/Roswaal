/**
 * The whole-number columns of an instance row: a part's colour, its id, its
 * look. They are bits, carried in a Float32Array beside the transform.
 *
 * An opaque colour with a lot of blue is a NaN as a float: 0xFFFF990D. V8 keeps
 * a NaN's bits when it is read into a JS number, but the specification leaves
 * that open, and JavaScriptCore and SpiderMonkey make every NaN the same one,
 * so the colour reached Safari as a half-clear dark blue.
 *
 * Node runs V8, so these tests read floats as those engines do: a NaN read from
 * a Float32Array by index comes back as the one NaN.
 */

import { describe, expect, it, vi } from "vitest";

import { HandleBuilder } from "../src/app/viewport/handles.js";
import { SELECT, tintedOutline } from "../src/app/viewport/view.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { buildPlaceScene, SCENE_STRIDE } from "../src/core/rbx/scene.js";

// Hoisted over the imports: handles.ts made its float as it loaded.
const { Real } = vi.hoisted(() => {
	const Real = globalThis.Float32Array;
	/** A Float32Array read as an engine that keeps only one NaN reads it. */
	class OneNaN extends Real {
		static get [Symbol.species]() {
			return Real;
		}
		// biome-ignore lint/suspicious/noExplicitAny: every overload of the constructor.
		constructor(...args: any[]) {
			// @ts-expect-error: every overload of the constructor.
			super(...args);
			return new Proxy(this, {
				get(target, key) {
					if (typeof key === "string" && /^\d+$/.test(key)) {
						const value = target[Number(key)];
						return Number.isNaN(value) ? Number.NaN : value;
					}
					const member = Reflect.get(target, key, target);
					return typeof member === "function" ? member.bind(target) : member;
				},
				set(target, key, value) {
					Reflect.set(target, key, value, target);
					return true;
				},
			});
		}
	}
	globalThis.Float32Array = OneNaN as unknown as Float32ArrayConstructor;
	return { Real };
});

const wordsOf = (data: Float32Array) => new Uint32Array(data.buffer, data.byteOffset, data.length);

function part(rgb: [number, number, number]): RbxInstance {
	const props: Record<string, [PropType, unknown]> = {
		CFrame: ["CFrame", { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
		size: ["Vector3", [4, 4, 4]],
		Color3uint8: ["Color3uint8", rgb],
	};
	return {
		className: "Part",
		name: "Part",
		parent: null,
		children: [],
		service: false,
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
	} as RbxInstance;
}

function sceneOf(rgb: [number, number, number]) {
	const workspace = {
		className: "Workspace",
		name: "Workspace",
		parent: null,
		children: [part(rgb)],
		service: true,
		props: new Map(),
	} as unknown as RbxInstance;
	return buildPlaceScene(workspace, () => 7);
}

describe("an instance's whole-number columns, where a NaN read is not its bits", () => {
	it("reads a NaN as the one NaN, or this file tests nothing", () => {
		const f = new Float32Array(1);
		new Uint32Array(f.buffer)[0] = 0xffff990d;
		const read = f[0];
		const again = new Real(1);
		again[0] = read;
		expect(new Uint32Array(again.buffer)[0]).toBe(0x7fc00000);
	});

	it("keeps an opaque blue part's colour", () => {
		const { data, count } = sceneOf([13, 153, 255]).kinds.block;
		expect(count).toBe(1);
		expect(wordsOf(data)[12]).toBe(0xffff990d);
	});

	it("keeps the part's id and its look beside the colour", () => {
		const { data } = sceneOf([13, 153, 255]).kinds.block;
		expect(wordsOf(data)[13]).toBe(7);
		expect(wordsOf(data)[14]).toBe(wordsOf(sceneOf([1, 2, 3]).kinds.block.data)[14]);
	});

	it("keeps the blue of a handle, and its place as no part", () => {
		const built = new HandleBuilder();
		built.ball([0, 0, 0], 2, [0.2, 0.4, 1]);
		const words = wordsOf(built.build().ball);
		expect(words[12]).toBe(0xffff6633);
		expect(words[13]).toBe(0xfffffffe);
	});

	it("keeps the selection's blue, solid and faint", () => {
		const box = new Real(SCENE_STRIDE);
		box[0] = 4;
		const [r, g, b] = SELECT.map((v) => Math.round(v * 255));
		const solid = tintedOutline(box, 255);
		const faint = tintedOutline(box, 105);
		expect(wordsOf(solid)[12]).toBe(((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
		expect(wordsOf(faint)[12]).toBe(((105 << 24) | (b << 16) | (g << 8) | r) >>> 0);
		expect(solid[0]).toBe(4);
	});
});
