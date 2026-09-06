/**
 * The guard that stops a graph being written into the wrong project.
 *
 * The daemon serves one project at a time and can be pointed at another one
 * while an editor tab is still open on the old one. The tab went on autosaving
 * against whatever root the daemon had moved to, and two stray graphs turned up
 * in `examples/demo` that way — with nothing going wrong from either side's
 * point of view, which is what made it worth a guard rather than a note.
 *
 * The decision is a pure function so it can be tested without binding a port.
 * What matters is which requests it lets through: too strict and the editor
 * cannot switch projects at all, too loose and the bug comes back.
 */

import { describe, expect, it } from "vitest";

import { refusesRequest } from "../src/server/app.js";

const HERE = "/projects/one";
const THERE = "/projects/two";

describe("the project guard", () => {
	it("refuses a write aimed at a project the daemon has left", () => {
		expect(refusesRequest("PUT", "/script", HERE, THERE)).toBe(true);
		expect(refusesRequest("POST", "/script/create", HERE, THERE)).toBe(true);
		expect(refusesRequest("PUT", "/map", HERE, THERE)).toBe(true);
	});

	it("allows a write to the project actually open", () => {
		expect(refusesRequest("PUT", "/script", HERE, HERE)).toBe(false);
	});

	it("lets reads through", () => {
		// Showing the new project's files is what the tab is about to be told to
		// do anyway, and refusing a read would leave it unable to recover.
		expect(refusesRequest("GET", "/tree", HERE, THERE)).toBe(false);
		expect(refusesRequest("HEAD", "/script", HERE, THERE)).toBe(false);
	});

	it("lets the editor change projects", () => {
		// These paths are relative to the /api mount, which is what `req.path`
		// is inside the middleware. Spelling them in full matches nothing, and
		// the guard would then refuse the very request meant to resolve it.
		expect(refusesRequest("POST", "/project/open", HERE, THERE)).toBe(false);
		expect(refusesRequest("POST", "/project/init", HERE, THERE)).toBe(false);
		expect(refusesRequest("POST", "/shutdown", HERE, THERE)).toBe(false);
	});

	it("does not lock out a client that sends no claim", () => {
		// An older editor, or a script using the API directly. This is a safety
		// net for a race, not an authentication scheme.
		expect(refusesRequest("PUT", "/script", undefined, THERE)).toBe(false);
	});

	it("has nothing to protect when no project is open", () => {
		expect(refusesRequest("PUT", "/script", HERE, null)).toBe(false);
	});
});
