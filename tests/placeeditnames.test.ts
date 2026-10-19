/**
 * Renaming in a place: anything but a service, under Studio's rules for a
 * name, and the project's links to scripts following the paths a rename moves.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { propertyEdit } from "../src/core/rbx/browse.js";
import { storedValue } from "../src/core/rbx/edit.js";
import { RbxError, readRbx } from "../src/core/rbx/index.js";
import { LINKS_FILE } from "../src/core/rbx/placeImport.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, type FixtureInstance, service } from "./rbxfixture.js";

const tree = (): FixtureInstance[] => [
	service("Workspace", [
		{ className: "Part", name: "Armour" },
		{
			className: "Folder",
			name: "Gun",
			children: [
				{ className: "Script", name: "Fire", props: { Source: { type: 1, value: "print(1)" } } },
			],
		},
	]),
];

describe("a name in Properties", () => {
	const doc = readRbx(buildPlace(tree()));
	const named = (name: string) => doc.instances.find((i) => i.name === name)!;

	it("can be changed on an instance, and not on a service", () => {
		expect(propertyEdit(named("Armour"), "Name")).toMatchObject({
			kind: "string",
			value: "Armour",
		});
		expect(propertyEdit(named("Workspace"), "Name")).toBeUndefined();
	});

	it("is one Studio would take", () => {
		const armour = named("Armour");
		const edit = propertyEdit(armour, "Name")!;
		const name = (n: string) => storedValue(edit, armour.props.get("Name")!, n);
		expect(() => name("")).toThrow(RbxError);
		expect(() => name("x".repeat(101))).toThrow(/at most 100/);
		expect(() => name("two\nlines")).toThrow(/line break/);
		expect(name("Hull Plate")).toEqual(new TextEncoder().encode("Hull Plate"));
	});
});

describe("renaming through the property route", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function open() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-names-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await writeFile(path.join(root, "place.rbxl"), buildPlace(tree()));
		await mkdir(path.join(root, ".roswaal"), { recursive: true });
		await writeFile(
			path.join(root, LINKS_FILE),
			JSON.stringify({
				schemaVersion: 1,
				place: "place.rbxl",
				scripts: [
					{
						file: "src/Fire.server.luau",
						className: "Script",
						instances: [{ path: ["Workspace", "Gun", "Fire"] }],
					},
				],
			}),
		);
		const session = new ApiSession({});
		await session.openAt(root);
		const outline = (await session.handle("GET", "/place")) as {
			stamp: string;
			outline: { nodes: [number, string, number, number][] };
		};
		const at = (name: string) => outline.outline.nodes.findIndex(([, n]) => n === name);
		return { session, stamp: outline.stamp, at };
	}

	it("answers with the instance where its new name sorts it", async () => {
		const { session, stamp, at } = await open();
		const answer = (await session.handle("POST", "/place/property", {
			body: { stamp, index: at("Armour"), property: "Name", value: "Zinc" },
		})) as { instance: { index: number; name: string; path: string[] } };
		expect(answer.instance.name).toBe("Zinc");
		expect(answer.instance.path).toEqual(["Workspace", "Zinc"]);
		// Armour sorted first under Workspace (1); Zinc sorts after Gun and its script: last of four.
		expect(at("Armour")).toBe(1);
		expect(answer.instance.index).toBe(3);
	});

	it("moves the project's links to scripts under what was renamed", async () => {
		const { session, stamp, at } = await open();
		await session.handle("POST", "/place/property", {
			body: { stamp, index: at("Gun"), property: "Name", value: "Cannon" },
		});
		const links = JSON.parse(await readFile(path.join(root, LINKS_FILE), "utf8"));
		expect(links.scripts[0].instances[0].path).toEqual(["Workspace", "Cannon", "Fire"]);
	});

	it("refuses a service's name", async () => {
		const { session, stamp, at } = await open();
		await expect(
			session.handle("POST", "/place/property", {
				body: { stamp, index: at("Workspace"), property: "Name", value: "World" },
			}),
		).rejects.toMatchObject({ status: 422 });
	});
});
