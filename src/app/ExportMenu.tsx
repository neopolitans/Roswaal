/**
 * Export: what leaves the editor, and in what shape.
 *
 * A menu rather than a question, because the choice has parts -- the project
 * as a zip or the place alone, the place as it was or holding the project's
 * scripts, as `.rbxl` or as Legacy `.rbxlx`, and whether to compile first --
 * and each is only worth answering once you can see what it would do. So the
 * menu runs the export once as it opens, without saving anything, and says
 * what Modify RBXL would write, which graphs are out of date and what Legacy
 * would leave out, before anybody picks.
 *
 * It drops from the Export button in the top bar when there is one, and is
 * the same menu, every row and note of it, on a touch screen: the context is
 * the point, so it is made finger-sized rather than cut down.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fromBase64 } from "../core/base64.js";
import { errorMessage } from "../core/errorMessage.js";
import { describePlaceReport, type PlaceReport } from "../core/rbx/placeExport.js";
import type { ExportChoices, RoswaalConfig } from "../core/schema.js";
import { api } from "./api.js";
import { cx } from "./cx.js";
import { LAYER } from "./layers.js";
import { download, zip } from "./zip.js";

type Exported = Awaited<ReturnType<typeof api.exportProject>>;
type Format = "rbxl" | "rbxlx";

export interface ExportMenuProps {
	onClose: () => void;
	/** Something went wrong after the menu closed: say so where the editor says things. */
	onError: (title: string, message: string) => void;
	/** The project's settings: what the menu starts with is its `export`. */
	config: RoswaalConfig;
	/** Keeps the choices in roswaal.json, when "Start with these choices" is ticked. */
	onConfig: (patch: Partial<RoswaalConfig>) => unknown;
	/** Compile project, as its button runs it: maps, then every graph. */
	onCompileProject: () => Promise<void>;
}

/** The element the menu drops from: the Export button in the top bar, when it is on screen. */
export const EXPORT_ANCHOR = "data-export-anchor";

const s = (n: number) => (n === 1 ? "" : "s");

/** A place's format, by its file name. Mirrors `placeFormatOf` in core/rbx/serialize.ts. */
const formatOf = (file: string): Format => (/\.rbxlx$/i.test(file) ? "rbxlx" : "rbxl");

/** What Modify RBXL would do, in one line, from the report the dry run gave. */
function summary(file: string, report: PlaceReport): string {
	const parts: string[] = [];
	if (report.scripts) parts.push(`writes ${report.scripts} script${s(report.scripts)}`);
	const adds = report.addedFiles.length;
	if (adds) {
		const folders = report.folders ?? 0;
		parts.push(`adds ${adds}${folders ? `, with ${folders} new folder${s(folders)}` : ""}`);
	}
	if (!parts.length) return `${file} already holds every script the project has a file for.`;
	const line = parts.join(" and ");
	return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

/** Graphs by name: the file's name without its folder or extension. */
const graphName = (path: string) =>
	path
		.split("/")
		.pop()!
		.replace(/\.nodescript$/, "");

/** "Lobby, Obstacles and 3 more". */
function names(paths: readonly string[]): string {
	const shown = paths.slice(0, 3).map(graphName);
	const more = paths.length - shown.length;
	if (more > 0) return `${shown.join(", ")} and ${more} more`;
	return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0]!;
}

/** What a conversion leaves out, as the warning says it. */
function leftOutLine(to: Format, kinds: readonly [string, number][]): string {
	const total = kinds.reduce((n, [, count]) => n + count, 0);
	const listed = kinds.slice(0, 3).map(([kind]) => kind);
	const more = kinds.length - listed.length;
	const what =
		more > 0 ? `${listed.join(", ")} and ${more} more kind${s(more)}` : listed.join(", ");
	return (
		`Left out of the .${to}: ${total} propert${total === 1 ? "y" : "ies"} Roswaal cannot write yet ` +
		`(${what}). Studio gives them its defaults.`
	);
}

export function ExportMenu({
	onClose,
	onError,
	config,
	onConfig,
	onCompileProject,
}: ExportMenuProps) {
	const kept = config.export ?? {};
	const [dry, setDry] = useState<Exported | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [shape, setShape] = useState<"zip" | "place">(kept.shape ?? "zip");
	const [modify, setModify] = useState(kept.modify ?? true);
	/** Unset until the dry run says what the place is: then the kept one, or the place's own. */
	const [format, setFormat] = useState<Format | null>(kept.format ?? null);
	const [compileFirst, setCompileFirst] = useState(kept.compileFirst ?? true);
	const [remember, setRemember] = useState(true);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState<"compiling" | "exporting" | null>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ top: number; right: number } | null>(null);

	useEffect(() => {
		let live = true;
		api.exportProject(true).then(
			(result) => {
				if (!live) return;
				setDry(result);
				setName(result.name || "roswaal-project");
				if (result.place) setFormat((was) => was ?? formatOf(result.place!.file));
			},
			(err: Error) => live && setFailure(err.message),
		);
		return () => {
			live = false;
		};
	}, []);

	// Under the Export button, its right edge on the button's; centred when the
	// menu was opened some other way and the button is not on screen.
	useLayoutEffect(() => {
		const anchor = document.querySelector<HTMLElement>(`[${EXPORT_ANCHOR}]`);
		if (!anchor || anchor.offsetParent === null) return;
		const r = anchor.getBoundingClientRect();
		setAt({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(innerWidth - r.right)) });
	}, []);

	useEffect(() => {
		if (dry) nameInput.current?.focus();
	}, [dry]);

	const place = dry?.place;
	const report = place?.report;
	const own = place ? formatOf(place.file) : "rbxl";
	const chosen: Format = format ?? own;
	const extension = `.${chosen}`;
	const stale = dry?.stale ?? [];
	const converting = !!place && chosen !== own;
	const loses = converting ? (place?.convertLoses ?? []) : [];
	const problems = report ? describePlaceReport(place!.file, report).detail : "";
	const hasProblems =
		!!report &&
		(report.notInPlace.length +
			report.ambiguous.length +
			report.wrongClass.length +
			(report.leftInPlace?.length ?? 0) >
			0 ||
			!!report.addError);

	async function run() {
		if (!dry || busy) return;
		try {
			if (compileFirst && stale.length) {
				setBusy("compiling");
				await onCompileProject();
			}
			setBusy("exporting");
			// Asked again: a compile, or a choice made since, changes what goes out.
			const exported = await api.exportProject(!!place && modify, place ? chosen : undefined);
			const bytesOf = (path: string) => fromBase64(exported.binaries?.[path] ?? "");
			const base = name.trim() || "roswaal-project";
			const placeOut = exported.place?.savedAs ?? exported.place?.file;
			if (shape === "place" && placeOut) {
				download(new Blob([bytesOf(placeOut) as BlobPart]), `${base}${extension}`);
			} else {
				const places = Object.fromEntries(
					Object.keys(exported.binaries ?? {}).map((path) => [path, bytesOf(path)]),
				);
				download(
					zip(
						Object.fromEntries(
							Object.entries({ ...exported.files, ...places }).map(([path, contents]) => [
								`${base}/${path}`,
								contents,
							]),
						),
					),
					`${base}.zip`,
				);
			}
			if (remember) {
				const choices: ExportChoices = {
					shape,
					modify,
					...(place ? { format: chosen } : {}),
					compileFirst,
				};
				if (JSON.stringify(choices) !== JSON.stringify(config.export ?? {}))
					void onConfig({ export: choices });
			}
			onClose();
		} catch (err) {
			onClose();
			onError("The project could not be exported", errorMessage(err));
		}
	}

	const choice = <T,>(
		value: T,
		current: T,
		set: (v: T) => void,
		label: React.ReactNode,
		title?: string,
	) => (
		<button
			type="button"
			className={current === value ? "on" : ""}
			aria-pressed={current === value}
			title={title}
			onClick={() => set(value)}
		>
			{label}
		</button>
	);

	return (
		<div
			className={cx("dialog-backdrop", at && "export-menu-backdrop")}
			style={{ zIndex: LAYER.menu + 1 }}
			onPointerDown={onClose}
		>
			<div
				ref={panel}
				className={cx("dialog export-menu", at && "export-menu-anchored")}
				style={at ? { top: at.top, right: at.right } : undefined}
				role="dialog"
				aria-label="Export"
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
					}
					if (
						e.key === "Enter" &&
						(e.target as HTMLElement).tagName === "INPUT" &&
						(e.target as HTMLInputElement).type === "text"
					) {
						e.preventDefault();
						void run();
					}
				}}
			>
				<h3>Export</h3>

				{failure ? (
					<p className="export-menu-problem">{failure}</p>
				) : !dry ? (
					<p>Reading the project…</p>
				) : (
					<div className="export-menu-form">
						<div className="export-menu-row">
							<span className="export-menu-label">Export</span>
							<span className="export-menu-control">
								<span className="segmented" role="group" aria-label="What to export">
									{choice("zip", shape, setShape, "Project (.zip)")}
									{place ? choice("place", shape, setShape, `Place only (${extension})`) : null}
								</span>
								<span className="export-menu-note">
									{shape === "zip"
										? `A zip: graphs, Luau and the Rojo project${place ? `, with ${place.file.replace(/\.rbxlx?$/i, extension)} in its root` : ""}.`
										: `${place?.file.replace(/\.rbxlx?$/i, extension)} alone, to open in Studio.`}
								</span>
							</span>
						</div>

						<label className="export-menu-row" htmlFor="export-name">
							<span className="export-menu-label">Name</span>
							<span className="export-menu-control">
								<span className="export-menu-name">
									<input
										ref={nameInput}
										id="export-name"
										className="tb"
										type="text"
										value={name}
										spellCheck={false}
										onChange={(e) => setName(e.target.value)}
									/>
									<span className="export-menu-suffix">{shape === "zip" ? ".zip" : extension}</span>
								</span>
							</span>
						</label>

						<div className="export-menu-row">
							<span className="export-menu-label">Before</span>
							<span className="export-menu-control">
								{stale.length ? (
									<>
										<span className="segmented" role="group" aria-label="Before exporting">
											{choice(true, compileFirst, setCompileFirst, "Compile first")}
											{choice(false, compileFirst, setCompileFirst, "Export as it is")}
										</span>
										<span className="export-menu-note">
											{compileFirst
												? `${names(stale)} changed since ${stale.length === 1 ? "it was" : "they were"} compiled; compiled first.`
												: `${names(stale)} export${stale.length === 1 ? "s" : ""} the Luau last compiled.`}
										</span>
									</>
								) : (
									<span className="export-menu-note export-menu-note-flush">
										Every graph's Luau matches its graph.
									</span>
								)}
							</span>
						</div>

						{place && report && (
							<>
								<div className="export-menu-section">Place file · {place.file}</div>
								<div className="export-menu-row">
									<span className="export-menu-label">Scripts</span>
									<span className="export-menu-control">
										<span className="segmented" role="group" aria-label="Scripts">
											{choice(true, modify, setModify, "Modify RBXL")}
											{choice(false, modify, setModify, "Don't Modify RBXL")}
										</span>
										<span className="export-menu-note">
											{modify ? summary(place.file, report) : "The place's scripts as they were."}
										</span>
										{modify && hasProblems && (
											<span className="export-menu-problem">{problems}</span>
										)}
									</span>
								</div>
								<div className="export-menu-row">
									<span className="export-menu-label">Save as</span>
									<span className="export-menu-control">
										<span className="segmented" role="group" aria-label="Place format">
											{choice<Format>("rbxl", chosen, setFormat, ".rbxl")}
											{choice<Format>(
												"rbxlx",
												chosen,
												setFormat,
												<>
													.rbxlx <span className="export-menu-legacy">Legacy</span>
												</>,
											)}
										</span>
										<span className="export-menu-note">
											{chosen === "rbxl"
												? "Binary, as Studio saves."
												: "XML: Studio's older format, readable in a diff."}
										</span>
										{loses.length > 0 && (
											<span className="export-menu-problem">{leftOutLine(chosen, loses)}</span>
										)}
									</span>
								</div>
							</>
						)}

						<div className="export-menu-section">Next time</div>
						<label className="export-menu-remember">
							<input
								type="checkbox"
								checked={remember}
								onChange={(e) => setRemember(e.target.checked)}
							/>
							Start with these choices for this project
						</label>
						<span className="export-menu-note">
							Kept in roswaal.json. Settings → Compiling → Exporting has them too.
						</span>
					</div>
				)}

				<div className="dialog-actions export-menu-foot">
					{dry && (
						<span className="export-menu-note export-menu-contents">
							{shape === "zip"
								? `${Object.keys(dry.files).length} files${place ? ` and ${place.file.replace(/\.rbxlx?$/i, extension)}` : ""} · the project itself is not changed`
								: "The project itself is not changed"}
						</span>
					)}
					<button className="tb" type="button" onClick={onClose}>
						Cancel
					</button>
					<button
						className="tb primary"
						type="button"
						disabled={!dry || busy !== null}
						onClick={() => void run()}
					>
						{busy === "compiling" ? "Compiling…" : busy === "exporting" ? "Exporting…" : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}
