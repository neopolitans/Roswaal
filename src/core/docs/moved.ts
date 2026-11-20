/**
 * Pages that moved: an old slug and the page that has its content now.
 *
 * Links written before the move -- in old release notes, on the DevForum, in
 * bookmarks -- keep working: the site writes a page at the old address that
 * sends the reader on, and a link inside the docs goes straight to the new one.
 */
export const MOVED_PAGES: Readonly<Record<string, string>> = {
	// Split on 20 Nov 2026 into Rojo projects and node maps, Editing a place
	// and The place in 3D, each one feature.
	"places-and-rojo": "editing-a-place",
	// Split the same day: compiling stayed, node maps went to Rojo projects.
	"building-and-rojo": "compiling-for-roblox",
};

/** Where a slug's page is now, keeping any `#` part. */
export function currentSlug(slug: string): string {
	const [bare, hash] = slug.split("#");
	const moved = MOVED_PAGES[bare];
	if (!moved) return slug;
	return hash ? `${moved}#${hash}` : moved;
}
