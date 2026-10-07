/**
 * A place to start from: the services a game has, a baseplate to stand on and
 * somewhere to spawn.
 *
 * **Written here rather than copied from Studio.** Studio's own Baseplate
 * template is Roblox's file, and putting it in a 0BSD repository would be
 * handing on something that is not ours to license. This is the same idea
 * described from nothing: class and property names are Roblox's API, the values
 * are ours, and anything left unsaid -- a part's colour, its material, the
 * services this does not list -- Studio fills in with its own defaults when the
 * file is opened.
 *
 * XML rather than binary because a person can read it, and because export
 * writes scripts into either: `writeSources` replaces a `Source`, and
 * `addInstances` adds the scripts and folders a project has that the place
 * does not.
 */

/** A part placed in the Workspace: where it sits and how big it is, in studs. */
interface PlacedPart {
	className: "Part" | "SpawnLocation";
	name: string;
	position: readonly [number, number, number];
	size: readonly [number, number, number];
}

/** The ground: 512 studs square and 16 deep, its top face at height 0. */
export const BASEPLATE: PlacedPart = {
	className: "Part",
	name: "BasePlate",
	position: [0, -8, 0],
	size: [512, 16, 512],
};

/**
 * Where players appear: a 12 by 12 pad at the centre, standing on the
 * baseplate -- half its height above the top face, so its bottom is on it.
 */
export const SPAWN: PlacedPart = {
	className: "SpawnLocation",
	name: "SpawnLocation",
	position: [0, 0.5, 0],
	size: [12, 1, 12],
};

/**
 * The services the place starts with, in Explorer's order. `StarterPlayer`'s
 * two script containers are written inside it, because a Rojo project that
 * syncs a Client folder into `StarterPlayerScripts` finds it there.
 */
export const BLANK_PLACE_SERVICES = [
	"Workspace",
	"Players",
	"Lighting",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"Teams",
	"SoundService",
] as const;

const STARTER_PLAYER_CHILDREN = ["StarterPlayerScripts", "StarterCharacterScripts"] as const;

/** XML-safe text; the names here are fixed, but the writer does not assume so. */
function escape(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * A referent for each instance, unique in the file. Studio reads any string
 * here; these follow its `RBX` and 32 hex digits so the file looks like one it
 * wrote, and are numbered so the same place is written the same way each time.
 */
function referent(n: number): string {
	return `RBX${n.toString(16).toUpperCase().padStart(32, "0")}`;
}

function props(entries: readonly string[], indent: string): string {
	return `${indent}<Properties>\n${entries.map((e) => `${indent}\t${e}`).join("\n")}\n${indent}</Properties>`;
}

function name(value: string): string {
	return `<string name="Name">${escape(value)}</string>`;
}

function part(p: PlacedPart, ref: string, indent: string): string {
	const [x, y, z] = p.position;
	const [sx, sy, sz] = p.size;
	const body = props(
		[
			name(p.name),
			'<bool name="Anchored">true</bool>',
			// Locked, as Studio's own ground is, so a click on the floor selects
			// what is on it rather than the floor.
			...(p.className === "Part" ? ['<bool name="Locked">true</bool>'] : []),
			`<CoordinateFrame name="CFrame"><X>${x}</X><Y>${y}</Y><Z>${z}</Z>` +
				"<R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12>" +
				"<R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame>",
			// `size` in lower case is the name Part's size is saved under.
			`<Vector3 name="size"><X>${sx}</X><Y>${sy}</Y><Z>${sz}</Z></Vector3>`,
		],
		`${indent}\t`,
	);
	return `${indent}<Item class="${p.className}" referent="${ref}">\n${body}\n${indent}</Item>`;
}

/**
 * The place as `.rbxlx` text.
 *
 * Opened in Studio it is a baseplate with a spawn on it and the usual
 * services; read by Roswaal it is a place like any imported one, and
 * `roswaal export` writes the project's scripts into it.
 */
export function blankPlaceXml(): string {
	let n = 0;
	const next = () => referent(++n);
	const items = BLANK_PLACE_SERVICES.map((service) => {
		const ref = next();
		const head = `\t<Item class="${service}" referent="${ref}">\n${props([name(service)], "\t\t")}`;
		let children: string[] = [];
		if (service === "Workspace") {
			children = [part(BASEPLATE, next(), "\t\t"), part(SPAWN, next(), "\t\t")];
		} else if (service === "StarterPlayer") {
			children = STARTER_PLAYER_CHILDREN.map(
				(child) =>
					`\t\t<Item class="${child}" referent="${next()}">\n${props([name(child)], "\t\t\t")}\n\t\t</Item>`,
			);
		}
		return [head, ...children, "\t</Item>"].join("\n");
	});
	return (
		'<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" ' +
		'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
		'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n' +
		'\t<Meta name="ExplicitAutoJoints">true</Meta>\n' +
		"\t<External>null</External>\n" +
		"\t<External>nil</External>\n" +
		`${items.join("\n")}\n` +
		"</roblox>\n"
	);
}
