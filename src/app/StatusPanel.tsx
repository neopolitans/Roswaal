/**
 * The problems list under the canvas: diagnostics, compile outcomes, node map
 * outcomes, pack errors and generated files left without a graph.
 */

import { Fragment } from "react";

import type { Diagnostic } from "../core/compiler/index.js";
import type { CompileOutcome, MapOutcome } from "./api.js";
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
	packErrors: string[];
	onForce: (path: string) => void;
}

export function StatusPanel(props: StatusPanelProps) {
	const { diagnostics, outcomes } = props;
	return (
		<div className="status">
			<div className="bar" onClick={props.onToggle}>
				<span>{props.open ? "▾" : "▸"}</span>
				<span className="count" style={{ color: props.errorCount ? "var(--danger)" : undefined }}>
					{props.errorCount} error{props.errorCount === 1 ? "" : "s"}
				</span>
				<span className="count" style={{ color: props.warningCount ? "var(--warning)" : undefined }}>
					{props.warningCount} warning{props.warningCount === 1 ? "" : "s"}
				</span>
				<span className="spacer" style={{ flex: 1 }} />
				{props.busy && <span>{props.busy}</span>}
				{!props.busy && outcomes.length > 0 && (
					<span>
						{outcomes.filter((o) => o.written).length} of {outcomes.length} written
					</span>
				)}
			</div>

			{props.open && (
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
					{props.packErrors.map((message, i) => (
						<div className="entry error" key={`pack${i}`}>
							<span className="sev">pack</span>
							<span>{message}</span>
						</div>
					))}
					{props.mapOutcomes.map((outcome) => (
						<div className={`entry ${outcome.written ? "" : "warning"}`} key={outcome.mapPath}>
							<span className="sev" style={outcome.written ? { color: "var(--ok)" } : undefined}>
								{outcome.unchanged ? "same" : outcome.written ? "wrote" : "skipped"}
							</span>
							<span>{outcome.skipped ?? outcome.outputPath}</span>
						</div>
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
									<span className="sev" style={{ color: "var(--ok)" }}>wrote</span>
									<span>{outcome.outputPath}</span>
								</div>
								{/* Deleted because this graph now writes somewhere else. */}
								{(outcome.superseded ?? []).map((gone) => (
									<div className="entry" key={gone}>
										<span className="sev">removed</span>
										<span>{gone} → {outcome.outputPath}</span>
									</div>
								))}
							</Fragment>
						);
					})}
					{diagnostics.map((d, i) => (
						<div className={`entry ${d.severity}`} key={i} onClick={() => d.node && store.reveal(d.node)}>
							<span className="sev">{d.severity}</span>
							<span>{d.message}</span>
							{d.pin && <span className="where">{d.pin}</span>}
						</div>
					))}
					{diagnostics.length === 0 && outcomes.length === 0 && props.mapOutcomes.length === 0 &&
						props.orphans.length === 0 && props.packErrors.length === 0 && (
						<div className="entry">
							<span className="sev" style={{ color: "var(--ok)" }}>ok</span>
							<span>No problems found.</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
