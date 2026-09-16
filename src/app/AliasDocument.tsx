/**
 * A `.luaurc`, opened from the project tree.
 *
 * ## Why this is a document and not a settings tab
 *
 * It was a tab in Settings first, beside `roswaal.json`, on the reasoning that
 * the two are the same kind of thing: committed files that describe the
 * project. That reasoning was right about what the file *is* and wrong about
 * where to put it. Settings is behind a gear, every other tab in it is
 * subtitled "This browser", and a panel that reads as per-developer is the
 * wrong frame for a file the whole repository shares.
 *
 * The deciding argument is narrower than either, though. **Where the file sits
 * is half of what it means**: a `.luaurc` in `src/ui` defines aliases for
 * `src/ui` and everything under it, and a name it does not define is inherited
 * from above. A settings tab has to explain that in words. A tree shows it.
 *
 * So the file is an entry in the tree like any other, and this is what opens.
 *
 * ## It edits the file, it does not own it
 *
 * Every write splices the `aliases` object and leaves the rest alone —
 * `languageMode`, lint settings, fields nobody here has heard of. An edit that
 * cannot be made without losing something is refused with the reason rather
 * than made anyway. Defining an alias expands what the project depends on,
 * which is the rule the module nodes are built on: it happens because you asked
 * for it, where you can see it.
 */

import { useMemo, useState } from "react";

import { Icon } from "./icons.jsx";
import {
	aliasesOf, chainFor, lookupAlias, parseLuaurc, withAliases,
	type AliasEntry, type Luaurc, type LuaurcSource,
} from "../core/luaurc.js";
import { ROBLOX_REQUIRE_ANNOUNCEMENT } from "../core/modules.js";
import type { Target } from "../core/schema.js";

export interface AliasDocumentProps {
	/** The directory of the file being edited; `""` is the project root. */
	dir: string;
	/**
	 * Every `.luaurc` in the project.
	 *
	 * All of them, though only one is being edited, because two of the things
	 * worth showing are about the others: what this file inherits from above,
	 * and whether a name you are about to add is already taken somewhere.
	 */
	files: LuaurcSource[];
	target: Target;
	onWrite: (dir: string, text: string) => void;
}

export function AliasDocument({ dir, files, target, onWrite }: AliasDocumentProps) {
	const parsed = useMemo(
		() => files.map((file) => parseLuaurc(file.dir, file.text)),
		[files],
	);
	const source = files.find((file) => file.dir === dir);
	const here = parsed.find((file) => file.dir === dir);

	const [draft, setDraft] = useState<{ name: string; value: string } | null>(null);
	const [refused, setRefused] = useState<string | null>(null);

	const aliases = here ? [...here.aliases.values()] : [];

	/** What this file can see, which is its own and its parents'. */
	const chain = useMemo(
		() => chainFor(parsed, dir === "" ? "x" : `${dir}/x`),
		[parsed, dir],
	);
	const inherited = useMemo(
		() => [...aliasesOf(chain)].filter(([, entry]) => entry.from !== dir),
		[chain, dir],
	);

	/** Every name in scope here, for the duplicate check. */
	const taken = useMemo(() => {
		const out = new Map<string, string>();
		for (const [key, entry] of aliasesOf(chain)) {
			out.set(key, entry.from === dir ? entry.name : `${entry.name}, from ${place(entry.from)}`);
		}
		return out;
	}, [chain, dir]);

	function write(next: AliasEntry[]) {
		const edited = withAliases(source?.text ?? "", next);
		if (edited.t === "refused") {
			setRefused(edited.why);
			return;
		}
		setRefused(null);
		onWrite(dir, edited.text);
	}

	const problem = draft === null ? null : draftProblem(draft.name, taken);

	return (
		<div className="alias-doc">
			<header className="alias-doc-head">
				<h1><code>{dir === "" ? ".luaurc" : `${dir}/.luaurc`}</code></h1>
				<p className="alias-scope">
					Aliases for {dir === "" ? "the whole project" : <code>{dir}/</code>}
					{dir === "" ? "" : " and everything under it"}. Committed, so everyone working
					here gets the same ones.
				</p>
			</header>

			{target === "roblox" && (
				<div className="settings-warn" role="note">
					<strong>Roblox does not resolve these yet.</strong> Its own announcement,{" "}
					<a href={ROBLOX_REQUIRE_ANNOUNCEMENT} target="_blank" rel="noreferrer noopener">
						Introducing Require-by-String
					</a>
					, answers “custom aliased paths?” with “Not yet, but we’re working on it!”, and
					its update of 8 January 2026 says they are working on custom aliases — checked
					16 September 2026. Until then this file is one Rojo will happily sync and the
					engine will ignore. <code>@self/</code> and <code>@game/</code> do work, and so
					do <code>./</code> and <code>../</code>.
				</div>
			)}

			{refused !== null && (
				<div className="settings-warn" role="alert">
					<strong>Not changed.</strong> {refused}
				</div>
			)}

			{here?.problems.map((trouble, i) => (
				<p key={i} className={`settings-problem ${trouble.severity}`}>{trouble.message}</p>
			))}

			{aliases.length === 0 && draft === null && (
				<p className="settings-note">Nothing defined in this file yet.</p>
			)}

			{aliases.map((alias) => (
				<div className="setting alias-row" key={alias.name}>
					<div className="setting-label">
						<strong><code>@{alias.name}</code></strong>
						<span>{lands(parsed, dir, alias.name)}</span>
					</div>
					<div className="setting-control alias-control">
						<input
							className="tb"
							value={alias.value}
							aria-label={`What @${alias.name} points at`}
							onChange={(e) => write(aliases.map((other) =>
								other.name === alias.name
									? { ...other, value: e.currentTarget.value }
									: other))}
						/>
						<button
							type="button"
							className="tb icon-only"
							title={`Remove @${alias.name}`}
							aria-label={`Remove @${alias.name}`}
							onClick={() => write(aliases.filter((other) => other.name !== alias.name))}
						>
							<Icon name="remove" size={14} />
						</button>
					</div>
				</div>
			))}

			{draft !== null && (
				<div className="setting alias-row">
					<div className="setting-label">
						<input
							className="tb"
							autoFocus
							placeholder="name"
							aria-label="Alias name"
							value={draft.name}
							onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
						/>
						<span className={problem === null ? "" : "settings-problem error"}>
							{problem ?? "Letters, digits, . - and _"}
						</span>
					</div>
					<div className="setting-control alias-control">
						<input
							className="tb"
							placeholder="./Packages/Roact"
							aria-label="What it points at"
							value={draft.value}
							onChange={(e) => setDraft({ ...draft, value: e.currentTarget.value })}
						/>
						<button
							type="button"
							className="tb"
							disabled={problem !== null || draft.value.trim() === ""}
							onClick={() => {
								write([...aliases, { name: draft.name.trim(), value: draft.value.trim() }]);
								setDraft(null);
							}}
						>
							Add
						</button>
						<button type="button" className="tb" onClick={() => setDraft(null)}>Cancel</button>
					</div>
				</div>
			)}

			{draft === null && (
				<button
					type="button"
					className="tb"
					onClick={() => setDraft({ name: "", value: "" })}
				>
					Add an alias
				</button>
			)}

			{/* What this file gets from above. Read-only on purpose: it belongs to
			    another file, and the way to change it is to open that one. */}
			{inherited.length > 0 && (
				<section className="alias-inherited">
					<h2>Also in scope here</h2>
					<p className="settings-note">
						Inherited from the <code>.luaurc</code> files above this one. A name defined
						here takes the place of one from above; the rest still arrive.
					</p>
					{inherited.map(([key, entry]) => (
						<div className="setting alias-row" key={key}>
							<div className="setting-label">
								<strong><code>@{entry.name}</code></strong>
								<span>{lands(parsed, entry.from, entry.name)}</span>
							</div>
							<div className="setting-control alias-from">
								<code>{place(entry.from)}</code>
							</div>
						</div>
					))}
				</section>
			)}
		</div>
	);
}

/** A directory, said the way a sentence would say it. */
function place(dir: string): string {
	return dir === "" ? "the project root" : `${dir}/`;
}

/**
 * Where an alias ends up, in one line under its name.
 *
 * Resolved rather than repeated: `@ui` bound to `@roact/Component` says
 * `Packages/Roact/Component` here, which is the thing you are checking when you
 * look at it. A chain that goes nowhere says so.
 */
function lands(files: Luaurc[], dir: string, name: string): string {
	const found = lookupAlias(chainFor(files, dir === "" ? "x" : `${dir}/x`), name);
	if (found.t === "cycle") return `Goes in a circle: ${found.names.join(" → ")}`;
	if (found.t === "missing") return `Points at @${found.name}, which nothing defines`;
	return found.alias.path === "" ? "The project root" : found.alias.path;
}

/**
 * Why this name cannot be used, or `null`.
 *
 * The duplicate check is case-insensitive because the *format* is. A panel that
 * let you define `@Roact` beside `@roact` would have written a file whose
 * behaviour nobody can predict, and it would look right until a require picked
 * the one you did not mean.
 */
function draftProblem(name: string, taken: Map<string, string>): string | null {
	const text = name.trim();
	if (text === "") return "A name is needed.";
	if (!/^[A-Za-z0-9.\-_]+$/.test(text)) return "Letters, digits, . - and _ only.";
	const clash = taken.get(text.toLowerCase());
	if (clash !== undefined) return `Already @${clash}. Names are case-insensitive.`;
	return null;
}
