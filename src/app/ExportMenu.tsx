/**
 * Export Project: what leaves the editor, and in what shape.
 *
 * A menu rather than a question, because the choice has parts -- the project
 * as a zip or the place alone, the place as it was or holding the project's
 * scripts -- and the second is only worth answering once you can see what it
 * would do. So the menu runs the export once as it opens, without saving
 * anything, and says what Modify RBXL would write, add and leave out before
 * anybody picks it.
 */

import { useEffect, useRef, useState } from "react";

import { api } from "./api.js";
import { LAYER } from "./layers.js";
import { download, zip } from "./zip.js";
import { fromBase64 } from "../core/base64.js";
import { describePlaceReport, type PlaceReport } from "../core/rbx/placeExport.js";
import { errorMessage } from "../core/errorMessage.js";

type Exported = Awaited<ReturnType<typeof api.exportProject>>;

export interface ExportMenuProps {
	onClose: () => void;
	/** Something went wrong after the menu closed: say so where the editor says things. */
	onError: (title: string, message: string) => void;
}

const s = (n: number) => (n === 1 ? "" : "s");

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

export function ExportMenu({ onClose, onError }: ExportMenuProps) {
	const [modified, setModified] = useState<Exported | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [shape, setShape] = useState<"zip" | "place">("zip");
	const [modify, setModify] = useState(true);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const nameInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let live = true;
		api.exportProject(true).then(
			(result) => {
				if (!live) return;
				setModified(result);
				setName(result.name || "roswaal-project");
			},
			(err: Error) => live && setFailure(err.message),
		);
		return () => {
			live = false;
		};
	}, []);

	const place = modified?.place;
	const report = place?.report;
	const extension = place ? (/\.rbxlx$/i.test(place.file) ? ".rbxlx" : ".rbxl") : "";
	const problems = report ? describePlaceReport(place!.file, report).detail : "";
	const hasProblems = !!report && (
		report.notInPlace.length + report.ambiguous.length + report.wrongClass.length + (report.leftInPlace?.length ?? 0) > 0 || !!report.addError
	);

	async function run() {
		if (!modified || busy) return;
		setBusy(true);
		try {
			// The dry run is the Modify export; the place as it was is asked for.
			const exported = place && !modify ? await api.exportProject(false) : modified;
			const bytesOf = (path: string) => fromBase64(exported.binaries?.[path] ?? "");
			const base = name.trim() || "roswaal-project";
			if (shape === "place" && place) {
				download(new Blob([bytesOf(place.file) as BlobPart]), `${base}${extension}`);
			} else {
				const places = Object.fromEntries(
					Object.keys(exported.binaries ?? {}).map((path) => [path, bytesOf(path)]),
				);
				download(
					zip(Object.fromEntries(
						Object.entries({ ...exported.files, ...places }).map(([path, contents]) => [`${base}/${path}`, contents]),
					)),
					`${base}.zip`,
				);
			}
			onClose();
		} catch (err) {
			onClose();
			onError("The project could not be exported", errorMessage(err));
		}
	}

	return (
		<div className="dialog-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={onClose}>
			<div
				className="dialog export-menu"
				role="dialog"
				aria-label="Export Project"
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
					}
					if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
						e.preventDefault();
						void run();
					}
				}}
			>
				<h3>Export Project</h3>

				{failure ? (
					<p className="export-menu-problem">{failure}</p>
				) : !modified ? (
					<p>Reading the project…</p>
				) : (
					<div className="export-menu-form">
						<label className="export-menu-row" htmlFor="export-format">
							<span className="export-menu-label">Format</span>
							<span className="export-menu-control">
								<select
									id="export-format"
									className="tb"
									value={shape}
									onChange={(e) => setShape(e.target.value as "zip" | "place")}
								>
									<option value="zip">Project (.zip)</option>
									<option value="place" disabled={!place}>
										{place ? `Place only (${extension})` : "Place only (no place file)"}
									</option>
								</select>
								<span className="export-menu-note">
									{shape === "zip"
										? `A zip: graphs, Luau and the Rojo project${place ? ", with the place in its root" : ""}.`
										: "The place file alone, to open in Studio."}
								</span>
							</span>
						</label>

						<div className="export-menu-section">File</div>
						<label className="export-menu-row" htmlFor="export-name">
							<span className="export-menu-label">Name</span>
							<span className="export-menu-control">
								<span className="export-menu-name">
									<input
										ref={nameInput}
										id="export-name"
										className="tb"
										value={name}
										spellCheck={false}
										onChange={(e) => setName(e.target.value)}
									/>
									<span className="export-menu-suffix">{shape === "zip" ? ".zip" : extension}</span>
								</span>
							</span>
						</label>

						{place && report && (
							<>
								<div className="export-menu-section">Place file</div>
								<div className="export-menu-row">
									<span className="export-menu-label">{place.file}</span>
									<span className="export-menu-control">
										<span className="segmented">
											<button type="button" className={modify ? "on" : ""} onClick={() => setModify(true)}>
												Modify RBXL
											</button>
											<button type="button" className={!modify ? "on" : ""} onClick={() => setModify(false)}>
												Don't Modify RBXL
											</button>
										</span>
										<span className="export-menu-note">
											{modify ? summary(place.file, report) : "The place as it was."}
										</span>
										{modify && hasProblems && <span className="export-menu-problem">{problems}</span>}
									</span>
								</div>
							</>
						)}
					</div>
				)}

				<div className="dialog-actions export-menu-foot">
					{modified && (
						<span className="export-menu-note export-menu-contents">
							{shape === "zip"
								? `${Object.keys(modified.files).length} files${place ? ` and ${place.file}` : ""} · the project itself is not changed`
								: "The project itself is not changed"}
						</span>
					)}
					<button className="tb" onClick={onClose}>Cancel</button>
					<button className="tb primary" disabled={!modified || busy} onClick={() => void run()}>
						{busy ? "Exporting…" : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}
