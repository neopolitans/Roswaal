/**
 * The extensions' routes, for the session's route table.
 *
 * One of the two places outside `src/extensions/` may import (the other is
 * `daemon.ts`; the editor's is `index.ts`). Both hosts load it -- the daemon
 * and the website's worker -- so nothing it reaches may need Node.
 */

import type { OpenProject } from "../server/project.js";
import type { LoadedPlace, RouteHandler } from "../server/routes.js";
import { type PlaceEditorCapabilities, placeEditorRoutes } from "./placeEditor/server/routes.js";

/** What a session lends an extension's routes. */
export interface ExtensionContext {
	/** The open project, or a 409 saying there is not one. */
	project(): OpenProject;
	/** The open project, or null. */
	current(): OpenProject | null;
	/** The project's place, parsed, from the session's cache while its bytes are unchanged. */
	loadPlace(project: OpenProject, file: string): Promise<LoadedPlace>;
}

/** What a host gives each extension. */
export interface ExtensionCapabilities {
	placeEditor?: PlaceEditorCapabilities;
}

/** Every extension's routes, for one session. */
export function extensionRoutes(
	ctx: ExtensionContext,
	capabilities: ExtensionCapabilities = {},
): Record<string, RouteHandler> {
	return { ...placeEditorRoutes(ctx, capabilities.placeEditor) };
}

/** The names of what a host gave the extensions, for `/health`'s capability list. */
export function extensionAbilities(capabilities: ExtensionCapabilities = {}): string[] {
	return Object.values(capabilities).flatMap((given) =>
		Object.entries(given ?? {})
			.filter(([, able]) => able !== undefined)
			.map(([name]) => name),
	);
}
