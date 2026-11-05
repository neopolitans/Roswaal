/**
 * A selected doc comment, in the Inspector.
 *
 * It opens on what most doc comments are -- a description, and a line for each
 * parameter -- and says how the rest stands without showing it:
 *
 * - Parameters, Returns and Errors fold to a line with a count and a tick, and
 *   a list opens by itself when something in it still needs words.
 * - Realm is one switch of three parts, any of them on, with the result said
 *   in words above it. None on is "Anywhere", which is what no realm tag means
 *   to Moonwave.
 * - Only what the comment says is shown, as chips with a ×. The rest is behind
 *   Add, a short menu that says what each one is.
 * - Within and the written form fold into Writing, at the foot.
 *
 * Text is the same comment as Moonwave, for a developer who would rather type
 * it: what is typed is read back into the fields as it goes, so the two never
 * disagree. Names, types and counts are the function's either way.
 */

import { useState } from "react";

import {
	DOC_REALMS,
	type DocSubject,
	docProblem,
	docSubject,
	docText,
	docWithin,
	readDocText,
	realmWords,
	undescribed,
} from "../core/docComments.js";
import type { Registry } from "../core/nodes/index.js";
import type { Comment, DocTags, NodeScript } from "../core/schema.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { useEditBurst } from "./editBurst.js";
import { updateComment } from "./edits.js";
import { Icon } from "./icons.jsx";
import { MenuButton } from "./Menu.jsx";
import { commentColor } from "./palette.js";
import { Ident } from "./PanelParts.jsx";
import { store } from "./store.js";

const KIND: Record<DocSubject["kind"], string> = {
	function: "function",
	class: "the module's class",
	interface: "interface",
	type: "type",
	none: "documents nothing yet",
	several: "holds more than one",
};

/** Words kept by name, with empty ones dropped, and nothing kept when none are left. */
function kept(words: Record<string, string>): Record<string, string> | undefined {
	const out = Object.fromEntries(Object.entries(words).filter(([, w]) => w.trim() !== ""));
	return Object.keys(out).length ? out : undefined;
}

/** The record without its empty parts, so a saved file says only what was said. */
function tidy(doc: DocTags): DocTags {
	const out: DocTags = {};
	for (const [key, value] of Object.entries(doc) as [keyof DocTags, unknown][]) {
		if (value === undefined || value === false) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		(out as Record<string, unknown>)[key] = value;
	}
	return out;
}

export function DocCommentInspector({
	comment,
	script,
	registry,
	locked,
}: {
	comment: Comment;
	script: NodeScript;
	registry: Registry;
	locked?: boolean;
}) {
	const subject = docSubject(script, registry, comment);
	const doc = comment.doc ?? {};
	const typing = useEditBurst();
	const [mode, setMode] = useState<"fields" | "text">("fields");
	const set = (next: DocTags) => store.edit((s) => updateComment(s, comment.id, { doc: tidy(next) }));
	const problem = docProblem(subject);
	const name = "name" in subject && subject.name ? subject.name : "Doc comment";

	return (
		<div className={cx("inspector doc-inspector", locked && "editing-locked")}>
			<PanelHead sub="Doc comment" />
			<div className="inspector-body">
				<Ident name={name} kind={`Doc comment · ${KIND[subject.kind]}`} color={commentColor(comment.color, true)} icon="moon" />
				<div className="segmented doc-mode" role="tablist" aria-label="Edit as">
					<button type="button" role="tab" aria-selected={mode === "fields"} className={cx(mode === "fields" && "on")} onClick={() => setMode("fields")}>
						Fields
					</button>
					<button type="button" role="tab" aria-selected={mode === "text"} className={cx(mode === "text" && "on")} onClick={() => setMode("text")}>
						Text
					</button>
				</div>
				{problem && <p className="doc-problem">{problem}</p>}
				{mode === "text" ? (
					<DocTextField comment={comment} subject={subject} moduleName={script.name} typing={typing} />
				) : (
					<>
						<textarea
							className="doc-desc"
							rows={2}
							placeholder="What it does, in a sentence or two"
							value={comment.text}
							onChange={(e) => {
								const text = e.target.value;
								typing.edit((s) => updateComment(s, comment.id, { text }));
							}}
							{...typing.field}
						/>
						<DocLists comment={comment} subject={subject} set={set} typing={typing} />
						<Realms doc={doc} set={set} />
						<Extras doc={doc} subject={subject} set={set} typing={typing} comment={comment} />
						<Writing comment={comment} moduleName={script.name} set={set} typing={typing} />
					</>
				)}
			</div>
		</div>
	);
}

type Typing = ReturnType<typeof useEditBurst>;

/** A list folded to a line: what it holds, and whether all of it has words. */
function Fold({
	label,
	count,
	missing,
	children,
}: {
	label: string;
	count: number;
	missing: number;
	children: React.ReactNode;
}) {
	// Open by itself when something in it needs words, as it is first shown.
	const [open, setOpen] = useState(missing > 0);
	return (
		<div className={cx("doc-fold", open && "open")}>
			<button type="button" className="doc-fold-row" aria-expanded={open} onClick={() => setOpen(!open)}>
				<Icon name="chevron" size={12} rotate={open ? 0 : -90} />
				<span className="label">{label}</span>
				<span className="sum">
					{count}
					{missing > 0 ? <span className="miss"> · {missing} to describe</span> : count > 0 ? <span className="ok"> ✓</span> : null}
				</span>
			</button>
			{open && <div className="doc-fold-body">{children}</div>}
		</div>
	);
}

function WordsRow({
	name,
	type,
	words,
	placeholder,
	onWords,
	typing,
}: {
	name: string;
	type?: string;
	words: string;
	placeholder: string;
	onWords: (words: string) => void;
	typing: Typing;
}) {
	return (
		<label className="doc-words">
			<span className="nm">{name}</span>
			{type && <span className="ty">{type}</span>}
			<input className="tb" value={words} placeholder={placeholder} onChange={(e) => onWords(e.target.value)} {...typing.field} />
		</label>
	);
}

/** Parameters, Returns and Errors for a function; Fields for an interface. */
function DocLists({
	comment,
	subject,
	set,
	typing,
}: {
	comment: Comment;
	subject: DocSubject;
	set: (doc: DocTags) => void;
	typing: Typing;
}) {
	const doc = comment.doc ?? {};
	const write = (next: DocTags) => typing.edit((s) => updateComment(s, comment.id, { doc: tidy(next) }));
	if (subject.kind === "interface") {
		const missing = subject.fields.filter((f) => !doc.fields?.[f.name]?.trim()).length;
		return (
			<Fold label="Fields" count={subject.fields.length} missing={missing}>
				{subject.fields.map((f) => (
					<WordsRow
						key={f.name}
						name={f.name}
						type={f.type}
						words={doc.fields?.[f.name] ?? ""}
						placeholder="What it holds"
						typing={typing}
						onWords={(w) => write({ ...doc, fields: kept({ ...doc.fields, [f.name]: w }) })}
					/>
				))}
			</Fold>
		);
	}
	if (subject.kind !== "function") return null;
	const still = undescribed(comment, subject);
	const errors = doc.errors ?? [];
	return (
		<div className="doc-lists">
			{subject.params.length > 0 && (
				<Fold label="Parameters" count={subject.params.length} missing={still.params.length}>
					{subject.params.map((p) => (
						<WordsRow
							key={p.name}
							name={p.name || "arg"}
							type={p.type}
							words={doc.params?.[p.name] ?? ""}
							placeholder="What it is for"
							typing={typing}
							onWords={(w) => write({ ...doc, params: kept({ ...doc.params, [p.name]: w }) })}
						/>
					))}
				</Fold>
			)}
			{subject.returns.length > 0 && (
				<Fold label="Returns" count={subject.returns.length} missing={still.returns.length}>
					{subject.returns.map((r, i) => (
						<WordsRow
							key={`${i}:${r.name}`}
							name={subject.returns.length > 1 ? String(i + 1) : "→"}
							type={r.type || "any"}
							words={doc.returns?.[i] ?? ""}
							placeholder="What it gives back"
							typing={typing}
							onWords={(w) => {
								const returns = subject.returns.map((_, j) => (j === i ? w : (doc.returns?.[j] ?? "")));
								write({ ...doc, returns: returns.some((x) => x.trim()) ? returns : undefined });
							}}
						/>
					))}
				</Fold>
			)}
			<Fold label="Errors" count={errors.length} missing={0}>
				{errors.map((error, i) => (
					<div className="doc-error" key={i}>
						<input
							className="tb"
							value={error.type}
							placeholder='"Missing"'
							aria-label="What it throws"
							onChange={(e) => write({ ...doc, errors: errors.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}
							{...typing.field}
						/>
						<input
							className="tb"
							value={error.description ?? ""}
							placeholder="When"
							aria-label="When it throws it"
							onChange={(e) =>
								write({ ...doc, errors: errors.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })
							}
							{...typing.field}
						/>
						<button type="button" className="tb icon-only" title="Remove this error" onClick={() => set({ ...doc, errors: errors.filter((_, j) => j !== i) })}>
							<Icon name="close" size={12} />
						</button>
					</div>
				))}
				<button type="button" className="tb doc-add" onClick={() => set({ ...doc, errors: [...errors, { type: "" }] })}>
					+ Add error
				</button>
			</Fold>
		</div>
	);
}

/** Used on: Server, Client and Plugin as one switch, any of them on. */
function Realms({ doc, set }: { doc: DocTags; set: (doc: DocTags) => void }) {
	const on = doc.realms ?? [];
	return (
		<div className="doc-realms">
			<div className="doc-realm-label">
				<span>Used on</span>
				<b>{realmWords(on)}</b>
			</div>
			<div className="doc-realm" role="group" aria-label="Used on">
				{DOC_REALMS.map((realm) => {
					const active = on.includes(realm);
					return (
						<button
							key={realm}
							type="button"
							className={cx(active && "on")}
							aria-pressed={active}
							onClick={() =>
								set({
									...doc,
									realms: DOC_REALMS.filter((r) => (r === realm ? !active : on.includes(r))),
								})
							}
						>
							<span className="tick">{active ? "✓" : ""}</span>
							{realm[0].toUpperCase() + realm.slice(1)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** What the comment says beyond its lists, as chips; the rest behind Add. */
function Extras({
	doc,
	subject,
	set,
	typing,
	comment,
}: {
	doc: DocTags;
	subject: DocSubject;
	set: (doc: DocTags) => void;
	typing: Typing;
	comment: Comment;
}) {
	const write = (next: DocTags) => typing.edit((s) => updateComment(s, comment.id, { doc: tidy(next) }));
	const flag = (key: "yields" | "unreleased" | "private" | "ignore", label: string) =>
		doc[key] ? (
			<span className="doc-chip" key={key}>
				{label}
				<button type="button" className="x" title={`Remove ${label}`} onClick={() => set({ ...doc, [key]: undefined })}>
					×
				</button>
			</span>
		) : null;
	const functionOnly = subject.kind === "function";
	const add = [
		doc.since === undefined && { label: "Since", hint: "the version it arrived in", run: () => set({ ...doc, since: "" }) },
		!doc.deprecated && { label: "Deprecated", hint: "since a version, and why", run: () => set({ ...doc, deprecated: { version: "" } }) },
		functionOnly && !doc.yields && { label: "Yields", hint: "it can pause the thread", run: () => set({ ...doc, yields: true }) },
		!doc.unreleased && { label: "Unreleased", run: () => set({ ...doc, unreleased: true }) },
		!doc.private && { label: "Private", hint: "for the author", run: () => set({ ...doc, private: true }) },
		!doc.ignore && { label: "Ignore", hint: "left out of the docs", run: () => set({ ...doc, ignore: true }) },
		{ label: "Tag", hint: "a label beside the name", run: () => set({ ...doc, tags: [...(doc.tags ?? []), ""] }) },
	].filter((entry): entry is { label: string; hint?: string; run: () => void } => Boolean(entry));
	return (
		<div className="doc-extras">
			{doc.since !== undefined && (
				<span className="doc-chip">
					<span className="k">Since</span>
					<input className="doc-chip-in" value={doc.since} placeholder="0.4.0" aria-label="Since" autoFocus={doc.since === ""} onChange={(e) => write({ ...doc, since: e.target.value })} {...typing.field} />
					<button type="button" className="x" title="Remove Since" onClick={() => set({ ...doc, since: undefined })}>
						×
					</button>
				</span>
			)}
			{doc.deprecated && (
				<span className="doc-chip wide">
					<span className="k">Deprecated</span>
					<input className="doc-chip-in" value={doc.deprecated.version} placeholder="version" aria-label="Deprecated since" autoFocus={doc.deprecated.version === ""} onChange={(e) => write({ ...doc, deprecated: { ...doc.deprecated!, version: e.target.value } })} {...typing.field} />
					<input className="doc-chip-in why" value={doc.deprecated.reason ?? ""} placeholder="why" aria-label="Why it is deprecated" onChange={(e) => write({ ...doc, deprecated: { ...doc.deprecated!, reason: e.target.value } })} {...typing.field} />
					<button type="button" className="x" title="Remove Deprecated" onClick={() => set({ ...doc, deprecated: undefined })}>
						×
					</button>
				</span>
			)}
			{functionOnly && flag("yields", "Yields")}
			{flag("unreleased", "Unreleased")}
			{flag("private", "Private")}
			{flag("ignore", "Ignore")}
			{(doc.tags ?? []).map((name, i) => (
				<span className="doc-chip" key={`tag${i}`}>
					<span className="k">Tag</span>
					<input className="doc-chip-in" value={name} placeholder="Player" aria-label="Tag" autoFocus={name === ""} onChange={(e) => write({ ...doc, tags: (doc.tags ?? []).map((t, j) => (j === i ? e.target.value : t)) })} {...typing.field} />
					<button type="button" className="x" title="Remove this tag" onClick={() => set({ ...doc, tags: (doc.tags ?? []).filter((_, j) => j !== i) })}>
						×
					</button>
				</span>
			))}
			<MenuButton
				label="Add"
				title="Add to the comment"
				sections={[{ label: "Add to the comment", entries: add.map((e) => ({ label: e.label, hint: e.hint, run: e.run })) }]}
			/>
		</div>
	);
}

/** Within and the written form: rarely changed, so folded at the foot. */
function Writing({
	comment,
	moduleName,
	set,
	typing,
}: {
	comment: Comment;
	moduleName: string;
	set: (doc: DocTags) => void;
	typing: Typing;
}) {
	const doc = comment.doc ?? {};
	const [open, setOpen] = useState(false);
	const form = comment.style === "doc" ? "---" : "--[=[ ]=]";
	return (
		<div className={cx("doc-fold", open && "open")}>
			<button type="button" className="doc-fold-row" aria-expanded={open} onClick={() => setOpen(!open)}>
				<Icon name="chevron" size={12} rotate={open ? 0 : -90} />
				<span className="label">Writing</span>
				<span className="sum">
					Within {docWithin(doc, moduleName)} · {form}
				</span>
			</button>
			{open && (
				<div className="doc-fold-body doc-writing">
					<label className="field">
						<span className="field-label">Within</span>
						<input
							className="tb"
							value={doc.within ?? ""}
							placeholder={moduleName}
							onChange={(e) => {
								const within = e.target.value;
								typing.edit((s) => updateComment(s, comment.id, { doc: tidy({ ...doc, within: within || undefined }) }));
							}}
							{...typing.field}
						/>
					</label>
					<label className="field">
						<span className="field-label">Written as</span>
						<select
							className="tb"
							value={comment.style === "doc" ? "doc" : "docBlock"}
							onChange={(e) => {
								const style = e.target.value === "doc" ? ("doc" as const) : ("docBlock" as const);
								store.edit((s) => updateComment(s, comment.id, { style }));
								set(doc);
							}}
						>
							<option value="docBlock">A --[=[ ]=] block</option>
							<option value="doc">--- lines</option>
						</select>
					</label>
				</div>
			)}
		</div>
	);
}

/**
 * The comment as Moonwave text, read back into the fields as it is typed. A
 * draft of its own, so the field is never rewritten under the caret; it is
 * written from the comment again whenever the text view is opened.
 */
function DocTextField({
	comment,
	subject,
	moduleName,
	typing,
}: {
	comment: Comment;
	subject: DocSubject;
	moduleName: string;
	typing: Typing;
}) {
	const [draft, setDraft] = useState(() => docText(comment, subject, moduleName));
	return (
		<>
			<textarea
				className="doc-text"
				spellCheck={false}
				rows={Math.min(18, Math.max(6, draft.split("\n").length + 1))}
				value={draft}
				onChange={(e) => {
					const text = e.target.value;
					setDraft(text);
					const read = readDocText(text);
					typing.edit((s) => updateComment(s, comment.id, { text: read.description, doc: tidy(read.doc) }));
				}}
				{...typing.field}
			/>
			<p className="summary">
				Moonwave, as it will be written. Parameters, returns and their types come from the function: write what each is
				for, and the rest of the line is filled in.
			</p>
		</>
	);
}
