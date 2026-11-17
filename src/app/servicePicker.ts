/**
 * What Add Service to Explorer offers: the services DataModel holds and does
 * not list, grouped by what each is for.
 *
 * The engine has no grouping to lend here. Every service derives from
 * `Instance` itself, so the type picker's family headings would put each one
 * under its own name. Their class icons' purposes do group them -- Lighting
 * under Lighting and sky, Players and Teams under Players, teams and chat --
 * and those are the headings Settings › Group classes › By purpose shows.
 */

import { classIconOf, PURPOSE_ORDER, purposeLabel } from "../core/classIcons.js";

/** The heading for a service whose class has no icon, and so no purpose. */
export const OTHER_SERVICES = "Other services";

/** Which heading a service sits under: its class icon's purpose. */
export function serviceGroup(className: string): string {
	const icon = classIconOf(className);
	return icon ? purposeLabel(icon.purpose) : OTHER_SERVICES;
}

/** The headings in the order Settings lists the purposes, the rest last. */
export const SERVICE_GROUPS_FIRST: readonly string[] = [
	...PURPOSE_ORDER.map(purposeLabel),
	OTHER_SERVICES,
];

/** A service in the place: its class, which is what is added, and its name, which is shown. */
export interface ServiceChoice {
	className: string;
	name: string;
}

/** The services to offer: each class once, in name order. */
export function serviceChoices(found: readonly ServiceChoice[]): ServiceChoice[] {
	const byClass = new Map<string, ServiceChoice>();
	for (const choice of found)
		if (!byClass.has(choice.className)) byClass.set(choice.className, choice);
	return [...byClass.values()].sort((a, b) => a.name.localeCompare(b.name));
}
