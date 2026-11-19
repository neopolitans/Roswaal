/**
 * A page left open across a deploy.
 *
 * Each build names its files by their contents, and a deploy replaces them.
 * A page loaded before the deploy still runs the old build, and the parts it
 * loads only when asked -- the Place Editor, a Settings page of an extension
 * -- are asked for by their old names, which the site no longer has. The
 * import fails, and nothing about it is broken but the page's age.
 *
 * Each browser words it differently: Chrome and Edge "Failed to fetch
 * dynamically imported module", Safari "Importing a module script failed",
 * Firefox "error loading dynamically imported module".
 */

const STALE =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

/** Whether `error` is a part of an older build that the site no longer serves. */
export function isStaleBuild(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return STALE.test(message);
}

/** What the editor says about it, in place of a crash. */
export const STALE_BUILD_MESSAGE =
	"Roswaal was updated since this page loaded, and that part is only on the new version. " +
	"Reload to get it. Nothing is lost: every graph is saved.";
