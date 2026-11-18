/**
 * A graph's or a Luau file's icon with the script it becomes in its corner: a
 * server for a Script, a monitor for a LocalScript, a puzzle piece for a
 * ModuleScript. The icon is drawn whole -- the Luau logo with its own square
 * cut out, a graph's page -- and cut away behind the badge, so the two stay
 * apart on any background. The class's colour comes from the class name the
 * caller gives, as the tree and the tabs colour scripts already.
 */

import { useId } from "react";

import type { NodeScript } from "../core/schema.js";
import { ICONS } from "./icons.jsx";

/** The script a graph or a Luau file becomes. */
export type ScriptRealm = "server" | "client" | "module";

/** A Roblox graph's script; a Lune graph is none of these. */
export function realmOfScript(
	script: Pick<NodeScript, "scriptClass" | "runContext" | "target">,
): ScriptRealm | undefined {
	if (script.target === "lune") return undefined;
	if (script.scriptClass === "ModuleScript") return "module";
	if (script.scriptClass === "LocalScript") return "client";
	return script.runContext === "Client" ? "client" : "server";
}

/** A Luau file's script, as Rojo reads its name. */
export function realmOfLuau(path: string): ScriptRealm {
	if (/\.server\.luau?$/i.test(path)) return "server";
	if (/\.client\.luau?$/i.test(path)) return "client";
	return "module";
}

/** The tree's and the tabs' colour class for a script. */
export function realmClass(realm: ScriptRealm | undefined): string | undefined {
	if (realm === "server") return "tree-script-server";
	if (realm === "client") return "tree-script-local";
	if (realm === "module") return "tree-script-module";
	return undefined;
}

/**
 * The badges, on a 24 grid, filled and bold enough for a few pixels. The
 * puzzle piece is Module Exports' (`nodeGlyphs.ts` `exports`), filled.
 */
const BADGES: Record<ScriptRealm, string> = {
	server:
		"M4 3h16a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 20 11H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 3Zm0 10h16a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 20 21H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 13ZM7 5.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Zm0 10a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Z",
	client:
		"M3.5 2.5h17A1.5 1.5 0 0 1 22 4v11.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 15.5V4a1.5 1.5 0 0 1 1.5-1.5ZM5 5.5v8.5h14V5.5ZM10 17h4v2.5h3.5v2.5h-11v-2.5H10Z",
	module: "M3 6.5h5a3 3 0 1 1 6 0h5V12a3 3 0 1 1 0 6v4.5H3Z",
};

export function ScriptIcon({
	kind,
	realm,
	size,
	className,
}: {
	/** A graph's page, or the Luau logo. */
	kind: "nodescript" | "luau";
	realm: ScriptRealm;
	size: number;
	className?: string;
}) {
	const cut = useId();
	const base = kind === "luau" ? ICONS.luauScript : ICONS.document;
	return (
		<svg
			className={className ? `icon script-icon ${className}` : "icon script-icon"}
			viewBox="0 0 24 24"
			width={size}
			height={size}
			aria-hidden="true"
			data-realm={realm}
		>
			<defs>
				<mask id={cut}>
					<rect width="24" height="24" fill="#fff" />
					{/* Starts below the Luau logo's own square, which stays whole. */}
					<rect x="11" y="11" width="15" height="15" rx="3.2" fill="#000" />
				</mask>
			</defs>
			<g mask={`url(#${cut})`}>
				{/* Material's 960 grid, onto this 24 one. */}
				<path
					d={base}
					fill="currentColor"
					fillRule="evenodd"
					transform="scale(0.025) translate(0 960)"
				/>
			</g>
			<path
				d={BADGES[realm]}
				fill="currentColor"
				fillRule="evenodd"
				transform="translate(12.5 12.5) scale(0.479)"
			/>
		</svg>
	);
}
