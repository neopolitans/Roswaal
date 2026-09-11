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

import type { NodeDef } from "../src/core/schema.js";
import { listPacks, openProject, savePackNode } from "../src/server/project.js";

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
