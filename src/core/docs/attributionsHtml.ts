/**
 * The attributions browser: every entry, findable by whoever holds it.
 *
 * Two views of the same list. **Simple** is every rights holder on one screen,
 * against the seven ways Roswaal uses their work. **Advanced** is the list by
 * holder -- searchable, filtered by usage, each entry one line of what Roswaal
 * does with it, where, and the licence of what it carries, which opens to the
 * licence itself.
 *
 * One builder for both renderers, as `walkthrough` and `nodemap` are: the
 * static site and the editor's docs window draw this markup, and
 * `src/app/attributionsBrowser.ts` wires it up in each. Without script the
 * views still switch (two radio inputs, as `tabs` does) and every entry and
 * licence is still there; search and the filters arrive with the script.
 */

import {
	ATTRIBUTIONS,
	type Attribution,
	attributionSlug,
	byHolder,
	holderStatement,
	licenceShown,
	USAGES,
} from "./attributions.js";
import { escapeHtml, inlineHtml } from "./inlineHtml.js";

const label = (key: string) => USAGES.find((usage) => usage.key === key)?.label ?? key;

/** An entry's anchor: unique across the page, and stable across builds. */
export function entryAnchor(entry: Attribution): string {
	return `attr-${attributionSlug(entry.name)}`;
}

/** A holder's anchor. */
export function holderAnchor(holder: string): string {
	return `holder-${attributionSlug(holder)}`;
}

/** Everything a search should find an entry by, lower case. */
function searchText(entry: Attribution): string {
	return [
		entry.name,
		entry.holder ?? "",
		entry.licence ?? "",
		licenceShown(entry),
		entry.note,
		entry.where,
		label(entry.usage),
	]
		.join(" ")
		.toLowerCase();
}

function badge(usage: string): string {
	return `<span class="attr-use use-${usage}">${escapeHtml(label(usage))}</span>`;
}

/** The licence cell: a button that opens it, or what is needed where nothing ships. */
function licenceCell(entry: Attribution): string {
	const text = escapeHtml(licenceShown(entry));
	if (!entry.ships || !entry.licenceFile) return `<span class="attr-none">${text}</span>`;
	return (
		`<button type="button" class="attr-licence" data-licence="${escapeHtml(entry.licenceFile)}" ` +
		`aria-label="Read the licence for ${escapeHtml(entry.name)}">${text}</button>`
	);
}

/**
 * The browser's markup.
 *
 * `pageHref` resolves a docs page link inside a note. `noticesHref` is where
 * this build's `THIRD-PARTY-NOTICES.txt` is, for the licence button that opens
 * it.
 */
export function attributionsHtml(pageHref: (slug: string) => string, noticesHref: string): string {
	const inline = (text: string) => inlineHtml(text, pageHref);
	const holders = byHolder();

	// Simple: a table, one row per holder, one column per usage type.
	const head = USAGES.map((usage) => `<th scope="col">${badge(usage.key)}</th>`).join("");
	const gridRows = holders
		.map(({ holder, entries }) => {
			const cells = USAGES.map((usage) => {
				const picks = [
					...entries
						.filter((entry) => entry.usage === usage.key)
						.map((entry) => ({ entry, text: entry.short ?? entry.name })),
					...entries
						.filter((entry) => entry.also?.usage === usage.key)
						.map((entry) => ({ entry, text: entry.also?.short ?? entry.name })),
				];
				if (picks.length === 0)
					return `<td><span class="attr-dot" aria-hidden="true">·</span></td>`;
				const buttons = picks
					.map(
						({ entry, text }) =>
							`<button type="button" class="attr-pick use-${usage.key}" data-pick="${entryAnchor(entry)}">` +
							`${escapeHtml(text)}</button>`,
					)
					.join("");
				return `<td>${buttons}</td>`;
			}).join("");
			return `<tr><th scope="row">${escapeHtml(holder)}</th>${cells}</tr>`;
		})
		.join("\n");
	// The same, as a list per holder, for a window too narrow for the table.
	const gridList = holders
		.map(({ holder, entries }) => {
			const picks = entries
				.map(
					(entry) =>
						`<button type="button" class="attr-pick use-${entry.usage}" data-pick="${entryAnchor(entry)}">` +
						`${escapeHtml(entry.short ?? entry.name)} · ${escapeHtml(label(entry.usage))}</button>`,
				)
				.join("");
			return `<li><strong>${escapeHtml(holder)}</strong><span>${picks}</span></li>`;
		})
		.join("\n");

	// Advanced: search, the usage filters, and the entries by holder.
	const chips = [
		`<button type="button" class="attr-chip" data-usage="all" aria-pressed="true">All <span>${ATTRIBUTIONS.length}</span></button>`,
		...USAGES.map(
			(usage) =>
				`<button type="button" class="attr-chip" data-usage="${usage.key}" aria-pressed="false">` +
				`${escapeHtml(usage.label)} <span>${ATTRIBUTIONS.filter((a) => a.usage === usage.key).length}</span></button>`,
		),
	].join("");
	const jumps = holders
		.map(
			({ holder }) =>
				`<a href="#${holderAnchor(holder)}" data-jump="${holderAnchor(holder)}">${escapeHtml(holder)}</a>`,
		)
		.join("");
	const groups = holders
		.map(({ holder, entries }) => {
			const statement = holderStatement(holder);
			const rows = entries
				.map((entry) => {
					const name = entry.url
						? `<a href="${escapeHtml(entry.url)}">${escapeHtml(entry.name)}</a>`
						: escapeHtml(entry.name);
					return (
						`<div class="attr-row" id="${entryAnchor(entry)}" data-usage="${entry.usage}" ` +
						`data-search="${escapeHtml(searchText(entry))}">` +
						`<div class="attr-name">${name}</div>` +
						`<div class="attr-how">${badge(entry.usage)}</div>` +
						`<div class="attr-lic">${licenceCell(entry)}</div>` +
						`<div class="attr-what"><span>${inline(entry.note)}</span>` +
						`<span class="attr-where">${inline(entry.where)}</span></div>` +
						"</div>"
					);
				})
				.join("\n");
			const count = entries.length === 1 ? "1 entry" : `${entries.length} entries`;
			return (
				`<section class="attr-holder" id="${holderAnchor(holder)}" data-holder>` +
				`<h3><span>${escapeHtml(holder)}</span><span class="attr-count">${count}</span></h3>` +
				(statement ? `<p class="attr-statement">${inline(statement)}</p>` : "") +
				`<div class="attr-rows">\n${rows}\n</div></section>`
			);
		})
		.join("\n");

	const legend = USAGES.map(
		(usage) =>
			`<li>${badge(usage.key)}<span><strong>${escapeHtml(usage.means)}</strong> ` +
			`${escapeHtml(usage.promise)}</span></li>`,
	).join("");

	return (
		`<div class="attr" data-attributions data-notices="${escapeHtml(noticesHref)}">\n` +
		`<input type="radio" name="attr-view" id="attr-view-simple" class="attr-radio" checked>` +
		`<input type="radio" name="attr-view" id="attr-view-advanced" class="attr-radio">` +
		`<div class="attr-switch" role="group" aria-label="View">` +
		`<label for="attr-view-simple">Simple</label><label for="attr-view-advanced">Advanced</label></div>\n` +
		`<section class="attr-simple" aria-label="Every rights holder, by how Roswaal uses their work">\n` +
		`<p class="attr-hint">Every rights holder on one screen, by how Roswaal uses their work. Pick a name to open it in Advanced.</p>\n` +
		`<div class="attr-grid-box"><table class="attr-grid"><thead><tr><th scope="col">Rights holder</th>${head}</tr></thead>\n` +
		`<tbody>\n${gridRows}\n</tbody></table></div>\n` +
		`<ul class="attr-grid-list">\n${gridList}\n</ul>\n` +
		"</section>\n" +
		`<section class="attr-advanced" aria-label="Every entry, by rights holder">\n` +
		`<div class="attr-tools" hidden>` +
		`<label class="attr-search"><span>Search</span>` +
		`<input type="search" placeholder="A name, a company or a licence: Roblox, MIT, Nord…" autocomplete="off" spellcheck="false"></label>` +
		`<div class="attr-chips" role="group" aria-label="How it is used">${chips}</div>` +
		`<p class="attr-summary" aria-live="polite"></p>` +
		"</div>\n" +
		`<nav class="attr-jumps" aria-label="Rights holders">${jumps}</nav>\n` +
		`<p class="attr-empty" hidden>Nothing matches. If it is not on this page, it is Roswaal's own and 0BSD.</p>\n` +
		`<div class="attr-groups">\n${groups}\n</div>\n` +
		"</section>\n" +
		`<details class="docs-details attr-legend"><summary><span class="docs-details-title">What each usage type means</span></summary>` +
		`<ul>${legend}</ul></details>\n` +
		"</div>"
	);
}
