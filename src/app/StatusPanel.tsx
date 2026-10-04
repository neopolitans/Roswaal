/**
 * The problems list under the canvas: diagnostics, compile outcomes, node map
 * outcomes, pack errors and generated files left without a graph.
 */

import { Fragment } from "react";

import type { Diagnostic } from "../core/compiler/index.js";
import type { CompileOutcome, MapOutcome } from "./api.js";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { store } from "./store.js";

export interface StatusPanelProps {
	open: boolean;
	onToggle: () => void;
	busy: string | null;
	errorCount: number;
	warningCount: number;
	diagnostics: Diagnostic[];
	outcomes: CompileOutcome[];
	mapOutcomes: MapOutcome[];
	orphans: string[];
	onRemoveOrphans: () => void;
	/** Graphs whose Luau goes to a folder no node map syncs, so Rojo never sees it. */
	unsynced: { graph: string; folder: string }[];
	packErrors: string[];
	onForce: (path: string) => void;
}

export function StatusPanel(props: StatusPanelProps) {
	const { diagnostics, outcomes } = props;
	const errors = `${props.errorCount} error${props.errorCount === 1 ? "" : "s"}`;
	const warnings = `${props.warningCount} warning${props.warningCount === 1 ? "" : "s"}`;
	const clean = props.errorCount === 0 && props.warningCount === 0;
	// Nothing to list: the bar has already said so, so no list under it.
	const nothing =
		diagnostics.length === 0 &&
		outcomes.length === 0 &&
		props.mapOutcomes.length === 0 &&
		props.orphans.length === 0 &&
		props.unsynced.length === 0 &&
		props.packErrors.length === 0;
	return (
		<div className="status">
			{/* The state first: a tick and No problems, or the counts as chips. */}
			<div className="bar" onClick={props.onToggle} aria-expanded={props.open}>
				{clean ? (
					<>
						<span className="sev-mark ok" aria-hidden>
							✓
						</span>
						<span className="status-state">No problems</span>
						<span className="count none">
							{errors} · {warnings}
						</span>
					</>
				) : (
					<>
						<span className={cx("count", props.errorCount ? "error" : "none")}>{errors}</span>
						<span className={cx("count", props.warningCount ? "warning" : "none")}>{warnings}</span>
					</>
				)}
				<span className="spacer" style={{ flex: 1 }} />
				{props.busy && <span>{props.busy}</span>}
				{!props.busy && outcomes.length > 0 && (
					<span>
						{outcomes.filter((o) => o.written).length} of {outcomes.length} written
					</span>
				)}
				<Icon name="chevron" size={14} className="status-fold" />
			</div>

			{props.open && !nothing && (
				<div className="list">
					{props.orphans.length > 0 && (
						<div className="entry warning">
							<span className="sev">stale</span>
							<span>
								{props.orphans.length} generated file
								{props.orphans.length === 1 ? "" : "s"} with no graph behind
								{props.orphans.length === 1 ? " it" : " them"}: {props.orphans.join(", ")}
							</span>
							<span
								className="where"
								style={{ cursor: "pointer", textDecoration: "underline" }}
								onClick={props.onRemoveOrphans}
							>
								remove
							</span>
						</div>
					)}
					{props.unsynced.map(({ graph, folder }) => (
						<div className="entry warning" key={`unsynced:${graph}`}>
							<span className="sev">unsynced</span>
							<span>
								{graph.split("/").pop()} compiles to {folder}, which no node map syncs.
							</span>
						</div>
					))}
					{props.packErrors.map((message, i) => (
						<div className="entry error" key={`pack${i}`}>
							<span className="sev">pack</span>
							<span>{message}</span>
						</div>
					))}
					{props.mapOutcomes.map((outcome) => (
						<Fragment key={outcome.mapPath}>
							<div className={`entry ${outcome.written ? "" : "warning"}`}>
								<span className="sev" style={outcome.written ? { color: "var(--ok)" } : undefined}>
									{outcome.unchanged ? "same" : outcome.written ? "wrote" : "skipped"}
								</span>
								<span>{outcome.skipped ?? outcome.outputPath}</span>
							</div>
							{/* Folders the map syncs, made so graphs have somewhere to go. */}
							{(outcome.made ?? []).map((folder) => (
								<div className="entry" key={folder}>
									<span className="sev" style={{ color: "var(--ok)" }}>
										made
									</span>
									<span>{folder}/</span>
								</div>
							))}
							{/* A synced folder that followed its entry's new path. */}
							{(outcome.moved ?? []).map((move) => (
								<Fragment key={`moved:${move.from}`}>
									<div className="entry">
										<span className="sev" style={{ color: "var(--ok)" }}>
											moved
										</span>
										<span>
											{move.name}: {move.from}/ → {move.to}/, and its graphs
										</span>
									</div>
									{move.kept.map((file) => (
										<div className="entry warning" key={`kept:${file}`}>
											<span className="sev">kept</span>
											<span>{file} stayed: the new folder has one of that name.</span>
										</div>
									))}
								</Fragment>
							))}
							{(outcome.held ?? []).map((move) => (
								<div className="entry warning" key={`held:${move.from}`}>
									<span className="sev">held</span>
									<span>
										{move.name} still syncs {move.to}/, but its graphs are in {move.from}/: the new
										folder already has files.
									</span>
								</div>
							))}
						</Fragment>
					))}
					{outcomes.map((outcome) => {
						// A graph with errors was held back by them, and overwriting
						// would write nothing. Only a file edited by hand, or one Roswaal
						// did not make, has anything to overwrite.
						const failed = outcome.diagnostics.some((d) => d.severity === "error");
						if (outcome.skipped) {
							return (
								<div className={`entry ${failed ? "error" : "warning"}`} key={outcome.scriptPath}>
									<span className="sev">{failed ? "failed" : "skipped"}</span>
									<span>{outcome.skipped}</span>
									{!failed && (
										<span
											className="where"
											style={{ cursor: "pointer", textDecoration: "underline" }}
											onClick={() => props.onForce(outcome.scriptPath)}
										>
											overwrite
										</span>
									)}
								</div>
							);
						}
						if (!outcome.written) return null;
						return (
							<Fragment key={outcome.scriptPath}>
								<div className="entry">
									<span className="sev" style={{ color: "var(--ok)" }}>
										wrote
									</span>
									<span>{outcome.outputPath}</span>
								</div>
								{/* Deleted because this graph now writes somewhere else. */}
								{(outcome.superseded ?? []).map((gone) => (
									<div className="entry" key={gone}>
										<span className="sev">removed</span>
										<span>
											{gone} → {outcome.outputPath}
										</span>
									</div>
								))}
							</Fragment>
						);
					})}
					{diagnostics.map((d, i) => (
						<div
							className={`entry ${d.severity}`}
							key={i}
							onClick={() => d.node && store.reveal(d.node)}
						>
							<span className="sev">{d.severity}</span>
							<span>{d.message}</span>
							{d.pin && <span className="where">{d.pin}</span>}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
