/**
 * Script analysis: the card under the canvas, in two scopes.
 *
 * **This Script** is the open graph: what the canvas's own check finds, and
 * what its last compile wrote. **Project** is every graph as the last project
 * compile or Check saw it, and the project's own files: stale output, folders
 * no map syncs, packs that will not load, what StyLua refused. The project's
 * lines stay out of This Script, where they read as the open graph's.
 *
 * Each scope carries its count in the bar, in the colour of the worst, so the
 * two read at a glance with the card folded. What is counted where is
 * `analysis.ts`'s, so the counts and the lists cannot disagree.
 */

import { Fragment, type ReactNode, useEffect, useState } from "react";

import type { Diagnostic } from "../core/compiler/index.js";
import {
	type AnalysisScope,
	type Counts,
	countOf,
	type ProjectAnalysis,
	sinceCheck,
} from "./analysis.js";
import type { CompileOutcome } from "./api.js";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";

export interface StatusPanelProps {
	open: boolean;
	onToggle: () => void;
	scope: AnalysisScope;
	onScope: (scope: AnalysisScope) => void;
	/** What the editor is doing, said where the status goes: "Compiling…". */
	busy: string | null;
	/** The open graph's name; `null` with none open. */
	graph: string | null;
	/** The open graph's problems, from the canvas's own check. */
	diagnostics: Diagnostic[];
	/** The open graph's last compile, if it has had one. */
	outcome?: CompileOutcome;
	/** The project, as last checked; its files are known without a check. */
	project: ProjectAnalysis;
	/** When the graphs were last compiled or checked; `null` before either. */
	checkedAt: number | null;
	/** Said while a Check runs. */
	checking: string | null;
	onCheck: () => void;
	onRemoveOrphans: () => void;
	/** Overwrite the file this outcome skipped, once its changes have been shown. */
	onForce: (outcome: CompileOutcome) => void;
	/** Opens a graph, if it is not the open one, and frames the node. */
	onGoTo: (path: string, nodeId?: string) => void;
	/** The open graph's path, for a problem on it. */
	graphPath: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "1 error, 2 warnings", or "no problems". */
const said = ({ errors, warnings }: Counts) =>
	errors + warnings === 0
		? "no problems"
		: [errors && plural(errors, "error"), warnings && plural(warnings, "warning")]
				.filter(Boolean)
				.join(", ");

/** A scope's count in the colour of its worst: red, amber, or a tick when clean. */
function Badge({ counts, known = true }: { counts: Counts; known?: boolean }) {
	if (!known) {
		return (
			<span className="badge unknown" title="Not checked yet" aria-label="not checked yet">
				–
			</span>
		);
	}
	const total = counts.errors + counts.warnings;
	const kind = counts.errors ? "error" : counts.warnings ? "warning" : "clean";
	return (
		<span className={cx("badge", kind)} title={said(counts)} aria-label={said(counts)}>
			{total === 0 ? "✓" : total}
		</span>
	);
}

/** The split under the bar: "1 error · 2 warnings", each in its colour. */
function Split({ counts }: { counts: Counts }) {
	if (counts.errors + counts.warnings === 0) return <>No problems</>;
	return (
		<>
			{counts.errors > 0 && <span className="err">{plural(counts.errors, "error")}</span>}
			{counts.errors > 0 && counts.warnings > 0 && " · "}
			{counts.warnings > 0 && <span className="warn">{plural(counts.warnings, "warning")}</span>}
		</>
	);
}

function Problem(props: { d: Diagnostic; onClick?: () => void }) {
	const { d } = props;
	return (
		<div
			className={`entry ${d.severity}`}
			role={props.onClick ? "button" : undefined}
			tabIndex={props.onClick ? 0 : undefined}
			onClick={props.onClick}
			onKeyDown={(e) => {
				if (props.onClick && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					props.onClick();
				}
			}}
		>
			<span className="sev">{d.severity}</span>
			<span className="msg">{d.message}</span>
			{d.pin && <span className="where">{d.pin}</span>}
		</div>
	);
}

/** A graph's compile, when it wrote nothing: skipped, with Overwrite, or failed. */
function Held(props: { outcome: CompileOutcome; onForce: (o: CompileOutcome) => void }) {
	const { outcome } = props;
	// A graph held back by its errors would write nothing if overwritten. Only
	// a file edited by hand, or one Roswaal did not make, has anything to take.
	const failed = outcome.diagnostics.some((d) => d.severity === "error");
	return (
		<div className={`entry ${failed ? "error" : "warning"}`}>
			<span className="sev">{failed ? "failed" : "skipped"}</span>
			<span className="msg">{outcome.skipped}</span>
			{!failed && (
				<button type="button" className="where link" onClick={() => props.onForce(outcome)}>
					overwrite
				</button>
			)}
		</div>
	);
}

export function StatusPanel(props: StatusPanelProps) {
	const { project, scope } = props;
	const scriptCounts = countOf(props.diagnostics);
	const checked = props.checkedAt !== null;

	// "Checked 4 min ago" moves on by itself.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!checked) return;
		const timer = window.setInterval(() => setNow(Date.now()), 30_000);
		return () => window.clearInterval(timer);
	}, [checked]);

	const status =
		props.busy ??
		(scope === "script"
			? (props.graph ?? "No graph open")
			: (props.checking ??
				(props.checkedAt !== null
					? `Checked ${sinceCheck(props.checkedAt, now)}`
					: "Not checked")));

	const tab = (id: AnalysisScope, long: string, short: string, badge: ReactNode) => (
		<button
			type="button"
			role="tab"
			className="scope-tab"
			aria-selected={scope === id}
			title={long}
			onClick={() => props.onScope(id)}
		>
			<span className="long">{long}</span>
			<span className="short">{short}</span>
			{badge}
		</button>
	);

	const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
	const fold = (key: string) =>
		setFolded((was) => {
			const next = new Set(was);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	const group = (key: string, head: ReactNode, body: ReactNode) => (
		<div className="group" data-open={!folded.has(key)} key={key}>
			<div
				className="group-head"
				role="button"
				tabIndex={0}
				aria-expanded={!folded.has(key)}
				onClick={() => fold(key)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						fold(key);
					}
				}}
			>
				<Icon name="chevron" size={12} className="group-chev" />
				{head}
			</div>
			<div className="group-body">{body}</div>
		</div>
	);

	return (
		<div className="status">
			<div className="bar">
				<span className="scopes" role="tablist" aria-label="Scope">
					{tab("script", "This Script", "Script", <Badge counts={scriptCounts} />)}
					{tab(
						"project",
						"Project",
						"Project",
						<Badge counts={project.counts} known={checked || project.files.length > 0} />,
					)}
				</span>
				<span className="spacer" />
				<span className="status-text">{status}</span>
				{scope === "project" && (
					<button
						type="button"
						className={cx("tb with-icon status-check", props.checking && "spin")}
						title="Check every graph, writing nothing"
						disabled={props.checking !== null || props.busy !== null}
						onClick={props.onCheck}
					>
						<Icon name="refresh" size={13} />
						<span className="tb-label">Check</span>
					</button>
				)}
				<button
					type="button"
					className="tb icon-only status-fold-button"
					aria-expanded={props.open}
					title={props.open ? "Fold Script analysis" : "Unfold Script analysis"}
					onClick={props.onToggle}
				>
					<Icon name="chevron" size={14} className="status-fold" />
				</button>
			</div>

			{props.open && (
				<>
					<div className="summary">
						{scope === "script" ? (
							props.graph === null ? (
								<>No graph open</>
							) : (
								<>
									<Split counts={scriptCounts} /> in <b>{props.graph}</b>
								</>
							)
						) : checked ? (
							<>
								<Split counts={project.counts} /> in {plural(project.graphs.length, "graph")} of{" "}
								{project.graphs.length + project.clean.length}
								{project.files.length > 0 && " and the project's files"}
							</>
						) : (
							<>Graphs not checked yet. Check reads every graph, writing nothing.</>
						)}
						{/* On a phone the bar has no room for when Project was checked, so it is
						    said here. This Script's status is the graph, named already. */}
						{scope === "project" && <span className="summary-status"> · {status}</span>}
					</div>

					<div className="list">
						{scope === "script" ? (
							<>
								{props.diagnostics.map((d, i) => (
									<Problem
										key={`d${i}`}
										d={d}
										onClick={
											d.node && props.graphPath
												? () => props.onGoTo(props.graphPath as string, d.node)
												: undefined
										}
									/>
								))}
								{props.outcome?.skipped && <Held outcome={props.outcome} onForce={props.onForce} />}
								{props.outcome?.written && (
									<>
										<div className="entry ok">
											<span className="sev">wrote</span>
											<span className="msg">{props.outcome.outputPath}</span>
										</div>
										{(props.outcome.superseded ?? []).map((gone) => (
											<div className="entry" key={gone}>
												<span className="sev">removed</span>
												<span className="msg">
													{gone} → {props.outcome?.outputPath}
												</span>
											</div>
										))}
									</>
								)}
							</>
						) : (
							<>
								{project.files.length > 0 &&
									group(
										"files",
										<>
											<span className="name">Project files</span>
											<span className="chips">
												<Badge counts={countOf(project.files)} />
											</span>
										</>,
										project.files.map((line) => (
											<div className={`entry ${line.severity}`} key={line.key}>
												<span className="sev">{line.label}</span>
												<span className="msg">{line.text}</span>
												{line.action === "remove" && (
													<button
														type="button"
														className="where link"
														onClick={props.onRemoveOrphans}
													>
														remove
													</button>
												)}
											</div>
										)),
									)}
								{project.graphs.map((g) =>
									group(
										g.path,
										<>
											<Icon name="graph" size={12} className="group-glyph" />
											<span className="name">{g.name}</span>
											<span className="path">{g.path}</span>
											{g.path === props.graphPath && <span className="open-here">open</span>}
											<span className="chips">
												<Badge counts={g.counts} />
											</span>
										</>,
										<Fragment>
											{g.edited && (
												<div className="stale-note">
													Edited since the check. Check again to update.
												</div>
											)}
											{g.problems.map((d, i) => (
												<Problem
													key={`${g.path}:${i}`}
													d={d}
													onClick={() => props.onGoTo(g.path, d.node)}
												/>
											))}
											{g.held && !g.held.diagnostics.some((d) => d.severity === "error") && (
												<Held outcome={g.held} onForce={props.onForce} />
											)}
										</Fragment>,
									),
								)}
								{project.clean.length > 0 && (
									<div className="clean-line">
										<Badge counts={{ errors: 0, warnings: 0 }} />
										<span>
											{plural(project.clean.length, "graph")} with no problems:{" "}
											{project.clean.slice(0, 8).join(", ")}
											{project.clean.length > 8 && `, and ${project.clean.length - 8} more`}
										</span>
									</div>
								)}
							</>
						)}
					</div>
				</>
			)}
		</div>
	);
}
