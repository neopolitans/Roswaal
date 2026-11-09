/**
 * An engine class's or a Roblox datatype's icon, in its purpose's colour.
 *
 * The shapes and colours are `core/classIcons.ts`; this draws one. Filled or
 * outline follows Settings › Class icons through the stylesheet, so nothing
 * here needs telling when it changes.
 */

import { useId } from "react";

import {
	classIconMarkup,
	classIconOf,
	type ClassIcon as Icon,
	NO_CLASS_ICON,
	typeIconOf,
} from "../core/classIcons.js";

/** A class's icon, else a datatype's, else undefined. */
export function iconFor(name: string): Icon | undefined {
	return classIconOf(name) ?? typeIconOf(name);
}

export interface ClassIconProps {
	/** The class or datatype. A name with no icon of its own gets the grey question mark. */
	name: string;
	size?: number;
	/** A colour to draw in instead of the purpose's: a datatype's wire colour. */
	tint?: string;
}

export function ClassIcon({ name, size = 14, tint }: ClassIconProps) {
	// A mask is found by its id, and a list draws the same class many times.
	const id = `ci${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
	const icon = iconFor(name);
	const { purpose, body } = icon ?? NO_CLASS_ICON;
	return (
		<svg
			className={icon ? "icon class-icon" : "icon class-icon none"}
			data-purpose={icon ? purpose : undefined}
			viewBox="0 -960 960 960"
			width={size}
			height={size}
			fill="currentColor"
			style={tint ? { color: tint } : undefined}
			aria-hidden
			// Generated markup from our own data, never from a document or a place.
			// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
			dangerouslySetInnerHTML={{ __html: classIconMarkup(body, id) }}
		/>
	);
}
