/**
 * A licence, exactly as Roswaal carries it.
 *
 * Settings › Licences and the Attributions page in the editor's docs both show
 * licences through this, so a holder checking their notice sees the same thing
 * wherever they look: the text as it was published, read-only, with line
 * numbers to cite, where it was copied from and when, and its SHA-256 so the
 * copy can be checked against the original rather than taken on trust.
 *
 * A real editor view rather than a `<pre>`, for the same reasons the source
 * view is one: selection that copies cleanly, the arrow keys, and line numbers
 * that are not part of what is copied. Not highlighted, because it is not code.
 *
 * The packages a build bundles are not in `CARRIED_LICENCES`: each build writes
 * them to `THIRD-PARTY-NOTICES.txt` beside itself (`scripts/lib/notices.mjs`),
 * and `BundledNotices` reads that file, so what it shows is that build's own.
 */

import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { RELEASES } from "../core/docs/releases.js";
import { CARRIED_LICENCES, type CarriedLicence } from "../core/licenceData.js";
import { editorTheme } from "./luauTheme.js";

/** The notices file beside this build, named so a new version is a new fetch. */
export function noticesUrl(): string {
	return `${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt?v=${encodeURIComponent(RELEASES[0].version)}`;
}

/** `2026-10-08` as a reader says it: 8 October 2026. */
export function licenceDate(day: string): string {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

/** The text, read-only, numbered and wrapped. */
export function LicenceText({ text, label }: { text: string; label: string }) {
	const host = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!host.current) return;
		const view = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: text,
				// Read-only but focusable, as the source view is: the cursor shows
				// and the arrow keys move it, and a tablet's keyboard stays shut.
				extensions: [
					lineNumbers(),
					EditorState.readOnly.of(true),
					EditorView.contentAttributes.of({ inputmode: "none", "aria-label": label }),
					EditorView.lineWrapping,
					editorTheme,
				],
			}),
		});
		return () => view.destroy();
	}, [text, label]);
	return <div className="licence-view" ref={host} />;
}

/** Copy, falling back to saying how when the clipboard refuses. */
function CopyText({ text }: { text: string }) {
	const [state, setState] = useState<"idle" | "copied" | "refused">("idle");
	useEffect(() => {
		if (state === "idle") return;
		const id = window.setTimeout(() => setState("idle"), 1800);
		return () => window.clearTimeout(id);
	}, [state]);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
		} catch {
			setState("refused");
		}
	};
	return (
		<button type="button" className="tb" onClick={() => void copy()}>
			{state === "copied" ? "Copied" : state === "refused" ? "Select it and copy" : "Copy text"}
		</button>
	);
}

/** One carried licence: whose, what it covers, where it came from, and the text. */
export function LicenceDetail({ licence }: { licence: CarriedLicence }) {
	return (
		<div className="licence-detail">
			<div className="licence-meta">
				<span>
					{licence.holder}. {licence.covers}
				</span>
				<span>
					Copied unchanged from{" "}
					<a href={licence.url} target="_blank" rel="noreferrer">
						{licence.source}
					</a>
					, {licenceDate(licence.retrieved)}.
				</span>
				<span className="licence-hash">
					<code>{licence.path}</code> · SHA-256 <code title={licence.sha256}>{licence.sha256}</code>
				</span>
			</div>
			<LicenceText text={licence.text} label={`${licence.name} licence, read-only`} />
			<div className="licence-actions">
				<CopyText text={licence.text} />
				<a className="tb" href={licence.url} target="_blank" rel="noreferrer">
					Compare with the original
				</a>
			</div>
		</div>
	);
}

/** This build's `THIRD-PARTY-NOTICES.txt`, read from beside it. */
export function BundledNotices() {
	const [text, setText] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let live = true;
		fetch(noticesUrl())
			.then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
			.then(
				(body) => live && setText(body),
				() => live && setFailed(true),
			);
		return () => {
			live = false;
		};
	}, []);

	if (failed) {
		return (
			<p className="settings-note licence-missing">
				This copy of Roswaal could not read its <code>THIRD-PARTY-NOTICES.txt</code>. It is beside
				every build, and in every release zip.
			</p>
		);
	}
	if (text === null) return <p className="settings-note">Reading the notices…</p>;
	return (
		<div className="licence-detail">
			<div className="licence-meta">
				<span>
					Every package this build bundles, each with its own licence file, copied as published.
				</span>
			</div>
			<LicenceText text={text} label="Third-party notices, read-only" />
			<div className="licence-actions">
				<CopyText text={text} />
				<a className="tb" href={noticesUrl()} target="_blank" rel="noreferrer">
					Open as a file
				</a>
			</div>
		</div>
	);
}

/**
 * The docs' `licences` block in the editor: each licence a fold, its editor
 * view made only once it is opened, and this build's notices last. The static
 * site draws the same folds as plain HTML (`licencesHtml` in `html.ts`).
 */
export function DocsLicences() {
	return (
		<div className="docs-licences">
			{CARRIED_LICENCES.map((licence) => (
				<LicenceFold
					key={licence.file}
					id={`licence-${licence.file.replace(/\.txt$/, "")}`}
					title={licence.name}
					spdx={licence.spdx}
					aside={licence.holder}
				>
					<LicenceDetail licence={licence} />
				</LicenceFold>
			))}
			<LicenceFold
				id="licence-notices"
				title="Third-party notices"
				spdx="MIT · ISC · BSD"
				aside="Every package in this build"
			>
				<BundledNotices />
			</LicenceFold>
		</div>
	);
}

function LicenceFold({
	id,
	title,
	spdx,
	aside,
	children,
}: {
	id: string;
	title: string;
	spdx: string;
	aside: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<details
			className="docs-details docs-licence"
			id={id}
			onToggle={(e) => setOpen(e.currentTarget.open)}
		>
			<summary>
				<span className="docs-details-title">
					{title} <span className="spdx">{spdx}</span>
				</span>
				<span className="aside">{aside}</span>
			</summary>
			{open && children}
		</details>
	);
}
