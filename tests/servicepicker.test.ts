/**
 * Add Service to Explorer's picker: which services it offers, under which
 * headings, and what a search and Enter pick from them.
 *
 * The picker is the type picker's own shell (`ValuePicker`); these test the
 * parts that are decisions, since there is no DOM here to render it into.
 */

import { describe, expect, it } from "vitest";
import {
	OTHER_SERVICES,
	SERVICE_GROUPS_FIRST,
	serviceChoices,
	serviceGroup,
} from "../src/app/servicePicker.js";
import { enterChoice, rankMatches } from "../src/app/ValuePicker.js";
import { classIconOf, purposeLabel } from "../src/core/classIcons.js";
import { BLANK_PLACE_SERVICES } from "../src/core/rbx/blankPlace.js";

describe("the services offered", () => {
	it("lists each class once, by name", () => {
		const found = [
			{ className: "Teams", name: "Teams" },
			{ className: "Chat", name: "Chat" },
			{ className: "Teams", name: "Teams" },
			{ className: "ServerStorage", name: "ServerStorage" },
		];
		expect(serviceChoices(found).map((s) => s.name)).toEqual(["Chat", "ServerStorage", "Teams"]);
	});

	it("keeps the name a place gave a service, and adds it by class", () => {
		const [only] = serviceChoices([{ className: "Workspace", name: "World" }]);
		expect(only).toEqual({ className: "Workspace", name: "World" });
	});
});

describe("the headings", () => {
	it("puts a service under its icon's purpose", () => {
		expect(serviceGroup("Lighting")).toBe(purposeLabel("light"));
		expect(serviceGroup("Teams")).toBe(purposeLabel(classIconOf("Teams")?.purpose ?? "studio"));
		expect(serviceGroup("SoundService")).toBe(
			purposeLabel(classIconOf("SoundService")?.purpose ?? "studio"),
		);
	});

	it("puts a class with no icon under Other services, last", () => {
		expect(serviceGroup("NotAServiceAnyoneShips")).toBe(OTHER_SERVICES);
		expect(SERVICE_GROUPS_FIRST.at(-1)).toBe(OTHER_SERVICES);
	});

	it("has a heading for every service a new place starts with", () => {
		for (const service of BLANK_PLACE_SERVICES) {
			expect(SERVICE_GROUPS_FIRST).toContain(serviceGroup(service));
		}
	});

	it("groups a new place's services under more than one heading", () => {
		expect(new Set(BLANK_PLACE_SERVICES.map(serviceGroup)).size).toBeGreaterThan(1);
	});
});

describe("searching the services", () => {
	const services = ["ServerScriptService", "ServerStorage", "StarterGui", "Teams", "Chat"];

	it("ranks a name that starts with the search first", () => {
		expect(rankMatches(services, "ser")).toEqual(["ServerStorage", "ServerScriptService"]);
		expect(rankMatches(services, "gui")).toEqual(["StarterGui"]);
	});

	it("searches the name shown, not the class behind it", () => {
		const labelOf = (cls: string) => (cls === "Teams" ? "Sides" : cls);
		expect(rankMatches(services, "sides", labelOf)).toEqual(["Teams"]);
		expect(rankMatches(services, "teams", labelOf)).toEqual([]);
	});

	it("is no search while the field is blank", () => {
		expect(rankMatches(services, "  ")).toBeNull();
	});
});

describe("what Enter picks", () => {
	it("picks the highlight", () => {
		expect(enterChoice(["Teams"], "Teams", "tea", true)).toBe("Teams");
	});

	it("picks nothing from a list-only picker when nothing matches", () => {
		expect(enterChoice([], "", "Workspace2", true)).toBe("");
	});

	it("still takes what is typed in a picker that is not list-only", () => {
		expect(enterChoice([], "", " Workspace2 ")).toBe("Workspace2");
		expect(enterChoice(null, "", " Model ")).toBe("Model");
	});
});
