/**
 * What a drag out of Properties carries: the instance, and the property or
 * attribute. In a module of its own so what reads it (the code editor's drop,
 * the Variables panel, the site's tour) need not load the place browser.
 */
export const PROPERTY_DRAG = "application/x-roswaal-property";

export interface PropertyDrag {
	path: string[];
	/** The instance's class, for the member's type on the node it makes. */
	className?: string;
	property?: string;
	attribute?: string;
}
