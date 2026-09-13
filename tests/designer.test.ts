/**
 * What the node designer writes.
 *
 * The form is a form; this is the half with consequences — a file in somebody's
 * repository, loaded by every editor that opens the project. So the rules are
 * tested against a real directory: where a pack may be written, what happens to
 * a node whose id is already in one, and that the loader's own check is what
 * decides, rather than a second opinion the designer keeps for itself.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runsOn } from "../src/core/packs.js";
import type { NodeDef } from "../src/core/schema.js";
import {
	copyPackBetween, deletePack, duplicatePack, listPacks, openProject, packUsage, readConfig,
	savePackNode, scanProjectPacks, setPackRequires,
} from "../src/server/project.js";

const PACK = ".roswaal/nodes/combat.nodedef.json";

const KNOCKBACK: NodeDef = {
	id: "combat.knockback",
	title: "Apply Knockback",
	category: "Combat",
	inputs: [
		{ id: "in", name: "", kind: "exec" },
		{ id: "character", name: "Character", kind: "data", type: "Instance" },
	],
	outputs: [{ id: "then", name: "", kind: "exec" }],
	compilesTo: { kind: "statement", template: "$in.character.HumanoidRootPart:ApplyImpulse(Vector3.zero)" },
};

async function project(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "roswaal-pack-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await mkdir(path.join(root, ".roswaal/nodes"), { recursive: true });
	return root;
}

describe("saving a designed node", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
		root = "";
	});

	it("writes it into a pack the project then loads", async () => {
		root = await project();
		const written = await savePackNode(await openProject(root), PACK, KNOCKBACK);
		expect(written.nodes).toEqual(["combat.knockback"]);

		const packs = await listPacks(await openProject(root));
		expect(packs.map((p) => p.path)).toEqual([PACK]);
		expect(packs[0]).toMatchObject({ name: "combat", format: "json", nodes: ["combat.knockback"], errors: [] });

		// And the registry has it, which is what makes it placeable.
		expect((await openProject(root)).registry.get("combat.knockback")?.title).toBe("Apply Knockback");
	});

	it("replaces the node with the same id rather than adding a second", async () => {
		root = await project();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		await savePackNode(await openProject(root), PACK, { ...KNOCKBACK, title: "Knock Back" });

		const document = JSON.parse(await readFile(path.join(root, PACK), "utf8")) as { nodes: NodeDef[] };
		expect(document.nodes).toHaveLength(1);
		expect(document.nodes[0].title).toBe("Knock Back");
	});

	it("keeps the other nodes in the pack", async () => {
		root = await project();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		await savePackNode(await openProject(root), PACK, { ...KNOCKBACK, id: "combat.stun", title: "Stun" });

		const packs = await listPacks(await openProject(root));
		expect(packs[0].nodes).toEqual(["combat.knockback", "combat.stun"]);
	});

	/** The same refusal that stops a third-party pack opening a block. */
	it("refuses a node the loader would not take", async () => {
		root = await project();
		const p = await openProject(root);
		const reserved = { ...KNOCKBACK, compilesTo: { kind: "builtin", handler: "flow.branch" } } as NodeDef;

		await expect(savePackNode(p, PACK, reserved)).rejects.toThrow(/builtin/);
		await expect(readFile(path.join(root, PACK), "utf8")).rejects.toThrow();
	});

	it("refuses a path that is not a pack in this project", async () => {
		root = await project();
		const p = await openProject(root);

		await expect(savePackNode(p, "src/sneaky.nodedef.json", KNOCKBACK)).rejects.toThrow(/node path/);
		await expect(savePackNode(p, ".roswaal/nodes/hand.nodedef.luau", KNOCKBACK))
			.rejects.toThrow(/nodedef\.json/);
	});

	it("lists a hand-written Luau pack, and says which it is", async () => {
		root = await project();
		await writeFile(
			path.join(root, ".roswaal/nodes/hand.nodedef.luau"),
			'-- a pack with comments, which is why it is Luau\nreturn {\n\tnodes = {\n\t\t{\n\t\t\tid = "hand.wave",\n\t\t\ttitle = "Wave",\n\t\t\tcategory = "Custom",\n\t\t\tinputs = { { id = "in", kind = "exec" } },\n\t\t\toutputs = { { id = "then", kind = "exec" } },\n\t\t\tcompilesTo = { kind = "statement", template = "print(\\"wave\\")" },\n\t\t},\n\t},\n}\n',
			"utf8",
		);

		const packs = await listPacks(await openProject(root));
		expect(packs).toHaveLength(1);
		expect(packs[0]).toMatchObject({ format: "luau", name: "hand", nodes: ["hand.wave"] });
	});
});

const LUAU_PACK =
	'-- a pack with comments, which is why it is Luau\nreturn {\n\tnodes = {\n\t\t{\n\t\t\tid = "hand.wave",\n\t\t\ttitle = "Wave",\n\t\t\tcategory = "Custom",\n\t\t\tinputs = { { id = "in", kind = "exec" } },\n\t\t\toutputs = { { id = "then", kind = "exec" } },\n\t\t\tcompilesTo = { kind = "statement", template = "print(\\"wave\\")" },\n\t\t},\n\t},\n}\n';

/**
 * The pack browser's actions. Each writes into somebody's repository, so each
 * is tested against a real directory — and the thing most worth pinning is what
 * each refuses, because a refusal is the only thing standing between a copy and
 * a graph whose nodes quietly changed underneath it.
 */
describe("managing packs", () => {
	const roots: string[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
	});
	const fresh = async () => {
		const root = await project();
		roots.push(root);
		return root;
	};

	it("says which targets a pack runs on, from its nodes", async () => {
		const root = await fresh();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		await savePackNode(await openProject(root), PACK, {
			...KNOCKBACK, id: "combat.players", title: "Players", targets: ["roblox"],
		});
		const [pack] = await listPacks(await openProject(root));
		expect(pack.targets).toEqual(["roblox"]);
		expect(runsOn(pack.targets, "lune")).toBe(false);
	});

	it("duplicates into its own namespace, so both packs load side by side", async () => {
		const root = await fresh();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		const copy = await duplicatePack(await openProject(root), PACK);

		expect(copy.path).toBe(".roswaal/nodes/combat-copy.nodedef.json");
		expect(copy.nodes).toEqual(["combat_copy.knockback"]);
		const registry = (await openProject(root)).registry;
		expect(registry.has("combat.knockback") && registry.has("combat_copy.knockback")).toBe(true);
	});

	/** Save as JSON pack: the editable copy of a pack the designer never rewrites. */
	it("copies a Luau pack to JSON and leaves the Luau file as it was", async () => {
		const root = await fresh();
		const luau = path.join(root, ".roswaal/nodes/hand.nodedef.luau");
		await writeFile(luau, LUAU_PACK, "utf8");
		const copy = await duplicatePack(await openProject(root), ".roswaal/nodes/hand.nodedef.luau");

		expect(copy).toMatchObject({ format: "json", nodes: ["hand_copy.wave"] });
		expect(await readFile(luau, "utf8")).toBe(LUAU_PACK);
	});

	it("says which graphs use a pack before it is deleted, then deletes only a pack", async () => {
		const root = await fresh();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
		await writeFile(
			path.join(root, ".roswaal/scripts/Main.nodescript"),
			JSON.stringify({
				schemaVersion: 1, kind: "script", id: "g", name: "Main", scriptClass: "Script",
				target: "roblox", typecheck: "strict", variables: [], links: [], comments: [],
				nodes: [
					{ id: "a", def: "combat.knockback", x: 0, y: 0 },
					{ id: "b", def: "combat.knockback", x: 0, y: 0 },
				],
			}),
		);

		const p = await openProject(root);
		expect(await packUsage(p, PACK)).toEqual([{ graph: ".roswaal/scripts/Main.nodescript", count: 2 }]);
		await expect(deletePack(p, ".roswaal/scripts/Main.nodescript")).rejects.toThrow(/not a node pack/);
		await deletePack(p, PACK);
		expect(await listPacks(await openProject(root))).toEqual([]);
	});

	it("imports a pack byte for byte, comments and all", async () => {
		const from = await fresh();
		const to = await fresh();
		await writeFile(path.join(from, ".roswaal/nodes/hand.nodedef.luau"), LUAU_PACK, "utf8");

		const scanned = await scanProjectPacks(from);
		expect(scanned.packs.map((p) => p.path)).toEqual([".roswaal/nodes/hand.nodedef.luau"]);

		await copyPackBetween(
			{ root: from, config: await readConfig(from) }, ".roswaal/nodes/hand.nodedef.luau", await openProject(to),
		);
		expect(await readFile(path.join(to, ".roswaal/nodes/hand.nodedef.luau"), "utf8")).toBe(LUAU_PACK);
	});

	/** Otherwise the copy would silently replace nodes graphs there already use. */
	it("refuses an import that defines an id the project already has", async () => {
		const from = await fresh();
		const to = await fresh();
		await savePackNode(await openProject(from), PACK, KNOCKBACK);
		await savePackNode(await openProject(to), ".roswaal/nodes/mine.nodedef.json", KNOCKBACK);

		await expect(
			copyPackBetween({ root: from, config: await readConfig(from) }, PACK, await openProject(to)),
		).rejects.toThrow(/already defines combat\.knockback/);
	});

	/** Saving a node used to write the file back as its nodes alone. */
	it("keeps what a pack requires when a node is saved into it", async () => {
		const root = await fresh();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		const set = await setPackRequires(await openProject(root), PACK, ["inventory", "inventory", ""]);
		expect(set.requires).toEqual(["inventory"]);

		await savePackNode(await openProject(root), PACK, { ...KNOCKBACK, title: "Knock Back" });
		const document = JSON.parse(await readFile(path.join(root, PACK), "utf8")) as { requires?: string[] };
		expect(document.requires).toEqual(["inventory"]);
		expect(Object.keys(document)[0], "and it is written above the nodes").toBe("requires");

		const cleared = await setPackRequires(await openProject(root), PACK, []);
		expect(cleared.requires).toEqual([]);
		expect("requires" in JSON.parse(await readFile(path.join(root, PACK), "utf8"))).toBe(false);
	});

	it("refuses a folder that is not a Roswaal project, and a copy into the same one", async () => {
		const plain = await mkdtemp(path.join(os.tmpdir(), "roswaal-plain-"));
		roots.push(plain);
		await expect(scanProjectPacks(plain)).rejects.toThrow(/no roswaal\.json/);

		const root = await fresh();
		await savePackNode(await openProject(root), PACK, KNOCKBACK);
		const p = await openProject(root);
		await expect(copyPackBetween(p, PACK, p)).rejects.toThrow(/this project/);
	});
});
