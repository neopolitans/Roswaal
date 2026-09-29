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
	const fileName = `${name.trim() || "roswaal-project"}${shape === "zip" ? ".zip" : extension}`;
	const problems = report ? describePlaceReport(place!.file, report).detail : "";
	const hasProblems = !!report && (report.notInPlace.length + report.ambiguous.length + report.wrongClass.length > 0 || !!report.addError);

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
			onError("The project could not be exported", (err as Error).message);
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
					<>
						<p>
							{Object.keys(modified.files).length} files
							{place ? <>, and the place file <code>{place.file}</code>.</> : ", and no place file."}
						</p>

						<fieldset className="dialog-choices">
							<legend>Export as</legend>
							<label className="dialog-option">
								<input type="radio" name="export-shape" checked={shape === "zip"} onChange={() => setShape("zip")} />
								<span>Project <span className="export-menu-note">A zip: graphs, Luau and the Rojo project{place ? ", with the place in its root" : ""}.</span></span>
							</label>
							<label className={`dialog-option${place ? "" : " dialog-option-off"}`}>
								<input type="radio" name="export-shape" disabled={!place} checked={shape === "place"} onChange={() => setShape("place")} />
								<span>Place only <span className="export-menu-note">{place ? "The place file alone, to open in Studio." : "This project has no place file."}</span></span>
							</label>
						</fieldset>

						{place && report && (
							<fieldset className="dialog-choices">
								<legend>Place file</legend>
								<label className="dialog-option">
									<input type="radio" name="export-modify" checked={modify} onChange={() => setModify(true)} />
									<span>Modify RBXL <span className="export-menu-note">{summary(place.file, report)}</span></span>
								</label>
								<label className="dialog-option">
									<input type="radio" name="export-modify" checked={!modify} onChange={() => setModify(false)} />
									<span>Don't Modify RBXL <span className="export-menu-note">The place as it was.</span></span>
								</label>
								{modify && hasProblems && <p className="export-menu-problem">{problems}</p>}
							</fieldset>
						)}

						<label className="field">
							<span>Name</span>
							<input
								ref={nameInput}
								id="export-name"
								className="tb"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</label>
						<p className="export-menu-note">Saved as {fileName}. The project itself is not changed.</p>
					</>
				)}

				<div className="dialog-actions">
					<button className="tb" onClick={onClose}>Cancel</button>
					<button className="tb primary" disabled={!modified || busy} onClick={() => void run()}>
						{busy ? "Exporting…" : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}
