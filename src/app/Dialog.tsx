/**
 * In-app prompts and confirmations.
 *
 * Replaces window.prompt and window.confirm. Native dialogs cannot be styled,
 * cannot be themed, and — the reason this exists — block the whole renderer
 * while they are open, which makes the app unresponsive to anything but a
 * human hand. An in-app modal is a few lines more and behaves.
 *
 * Drawn as the panels are: a header band with a badge in the colour of the
 * kind of question -- the accent to make or open something, red to delete,
 * amber when something needs deciding, grey for a notice -- fields beside
 * bold labels, one of several as rows to pick, and a foot naming the keys.
 */

import { Fragment, useEffect, useRef, useState } from "react";
import type { ShownLine } from "../core/lineDiff.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { FolderPicker } from "./FolderPicker.jsx";
import { Icon, type IconName } from "./icons.jsx";
import { LAYER } from "./layers.js";
import { ModalHead } from "./ModalParts.jsx";
import { realmClass, ScriptIcon, type ScriptRealm } from "./ScriptIcon.jsx";
import { Row, Toggle } from "./settingsParts.jsx";

export type DialogRequest =
	| {
			kind: "prompt";
			title: string;
			/** One line under the title: where the thing is, or what it holds. */
			subtitle?: string;
			label?: string;
			/** A line under the field: where the thing will be made. */
			hint?: string;
			/** Said under the field in the warning colour, which outlines it: it will not sync. */
			warn?: string;
			value?: string;
			placeholder?: string;
			confirmLabel?: string;
			icon?: IconName;
			/**
			 * A folder list under the name, which picks where the thing is made.
			 * `hint` and `warn` then follow the folder picked; `onFolder` hears it.
			 */
			folder?: {
				tree: readonly TreeEntry[];
				base: { path: string; label: string };
				value: string;
				hint: (dir: string) => string;
				warn?: (dir: string) => string | undefined;
				onFolder: (dir: string) => void;
				onCreateFolder: (parent: string, name: string) => Promise<void>;
			};
	  }
	| {
			kind: "confirm";
			title: string;
			/** One line under the title: where the thing is, or what it holds. */
			subtitle?: string;
			message: string;
			/** Listed under the message: what the confirmation is about, by name. */
			items?: string[];
			/** Sentences under the message, as plain bullets rather than names. */
			points?: string[];
			/**
			 * What each named thing does under the action, in two groups: what it
			 * changes (a check) and what it leaves (a dash), each with why.
			 */
			checklist?: { done: string; kept: string; rows: { name: string; note: string; ok: boolean }[] };
			/** What the action changes in a file, line by line. */
			diff?: ShownLine[];
			confirmLabel?: string;
			danger?: boolean;
			icon?: IconName;
	  }
	| { kind: "notice"; title: string; subtitle?: string; message: string }
	| {
			/** One of several answers, each its own button. Resolves to its value, or null. */
			kind: "choice";
			title: string;
			/** One line under the title: where the thing is, or what it holds. */
			subtitle?: string;
			message: string;
			/** Listed under the message: what the choice is about, by name. */
			items?: string[];
			choices: { value: string; label: string; primary?: boolean }[];
	  }
	| {
			/** Several answers at once. Resolves to `FormAnswers` as JSON, or null. */
			kind: "form";
			title: string;
			/** One line under the title: where the thing is, or what it holds. */
			subtitle?: string;
			message: string;
			/** Sentences under the message and above the fields, as plain bullets. */
			points?: string[];
			fields: FormField[];
			confirmLabel?: string;
			icon?: IconName;
	  };

export type FormField = (
	| {
			id: string;
			kind: "text";
			label: string;
			value: string;
			/** A Choose… button beside it that fills it: a folder from the system's dialog. */
			browse?: (current: string) => Promise<string | null>;
	  }
	| {
			id: string;
			kind: "choice";
			label: string;
			value: string;
			/** Two or three short ones are a segmented control; more are rows. */
			options: { value: string; label: string; script?: ScriptRealm }[];
	  }
	/** One of however many, as a dropdown: a list that could be long. */
	| {
			id: string;
			kind: "select";
			label: string;
			value: string;
			options: { value: string; label: string }[];
	  }
	| {
			id: string;
			kind: "check";
			label: string;
			value: boolean;
			/** Only offered while another field has this answer, or one of these. */
			when?: { id: string; value: string | string[] };
	  }
) & {
	/** A line under the label, as a Settings row has. */
	help?: string;
};

/** Choices few and short enough to sit side by side. */
function segmentable(options: readonly { label: string }[]): boolean {
	return options.length <= 3 && options.every((o) => o.label.length <= 18);
}

/** A path as a name in front and where it is behind, faint. */
function splitPath(path: string): { name: string; dir: string } {
	const at = path.lastIndexOf("/");
	return at < 0 ? { name: path, dir: "" } : { name: path.slice(at + 1), dir: path.slice(0, at) };
}

function itemIcon(path: string): IconName {
	if (/\.(luau|lua)$/.test(path)) return "luauScript";
	if (/\.[A-Za-z]+$/.test(path)) return "document";
	return "folder";
}

export type FormAnswers = Record<string, string | boolean>;

/** A prompt resolves to its text or null; a confirm to true or false. */
export type DialogResult = string | boolean | null;

export interface PendingDialog {
	request: DialogRequest;
	resolve: (result: DialogResult) => void;
	/**
	 * Which question this is, for the key it is drawn under. A question that
	 * replaced another in the same render was drawn by the same component, with
	 * the first one's answers: the New project form opened over the notice
	 * Add Place left up, and named the project "undefined".
	 */
	id?: number;
}

/** The colour a kind of question is drawn in, and its glyph unless it names one. */
function toneOf(request: DialogRequest): { tone: string; icon: IconName } {
	switch (request.kind) {
		case "prompt":
			return { tone: "accent", icon: request.icon ?? "rename" };
		case "form":
			return { tone: "accent", icon: request.icon ?? "document" };
		case "confirm":
			return request.danger
				? { tone: "danger", icon: request.icon ?? "remove" }
				: { tone: "accent", icon: request.icon ?? "help" };
		case "choice":
			return { tone: "warning", icon: "warning" };
		case "notice":
			return { tone: "info", icon: "help" };
	}
}

export function Dialog({ request, resolve }: PendingDialog) {
	const [text, setText] = useState(request.kind === "prompt" ? (request.value ?? "") : "");
	const [folder, setFolder] = useState(
		request.kind === "prompt" && request.folder ? request.folder.value : "",
	);
	const pickFolder = (dir: string) => {
		setFolder(dir);
		if (request.kind === "prompt") request.folder?.onFolder(dir);
	};
	const hint =
		request.kind !== "prompt"
			? undefined
			: request.folder
				? request.folder.hint(folder)
				: request.hint;
	const warn =
		request.kind !== "prompt"
			? undefined
			: request.folder
				? request.folder.warn?.(folder)
				: request.warn;
	const [answers, setAnswers] = useState<FormAnswers>(() =>
		request.kind === "form" ? Object.fromEntries(request.fields.map((f) => [f.id, f.value])) : {},
	);
	const offered = (field: FormField) => {
		if (field.kind !== "check" || !field.when) return true;
		const wanted = field.when.value;
		const given = answers[field.when.id];
		return Array.isArray(wanted) ? wanted.includes(String(given)) : given === wanted;
	};
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Select rather than just focus, so typing replaces a suggested name.
		input.current?.focus();
		input.current?.select();
	}, []);

	function cancel() {
		resolve(
			request.kind === "prompt" || request.kind === "form" || request.kind === "choice"
				? null
				: false,
		);
	}

	function accept() {
		if (request.kind === "prompt") resolve(text.trim() === "" ? null : text.trim());
		else if (request.kind === "choice") {
			// Enter is the primary answer, and nothing when there is none.
			const primary = request.choices.find((c) => c.primary);
			if (primary) resolve(primary.value);
		} else if (request.kind === "form") {
			// A check that is not on offer answers false, whatever it was left at.
			const out: FormAnswers = {};
			for (const field of request.fields)
				out[field.id] = offered(field) ? answers[field.id] : false;
			resolve(JSON.stringify(out));
		} else resolve(true);
	}

	const { tone, icon } = toneOf(request);
	const items = request.kind === "confirm" || request.kind === "choice" ? request.items : undefined;

	return (
		<div className="dialog-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={cancel}>
			<div
				className={cx(
					"dialog dialog-panel",
					`dialog-${tone}`,
					request.kind === "choice" && "dialog-wide",
				)}
				role="dialog"
				aria-modal="true"
				aria-label={request.title}
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						cancel();
					}
					if (e.key === "Enter") {
						e.preventDefault();
						accept();
					}
				}}
			>
				<ModalHead
					icon={icon}
					title={request.title}
					sub={request.subtitle}
					closeLabel={request.kind === "notice" ? "Close" : "Cancel"}
					onClose={request.kind === "notice" ? accept : cancel}
				/>

				<div className="dialog-body">
					{request.kind === "prompt" ? (
						<>
							<label className={cx("field wide", warn && "warn")}>
								{request.label && <span>{request.label}</span>}
								<input
									ref={input}
									className="tb"
									value={text}
									placeholder={request.placeholder}
									onChange={(e) => setText(e.target.value)}
								/>
								{hint && (
									<small>
										<Icon name="folder" size={12} />
										{hint}
									</small>
								)}
								{warn && (
									<small className="field-warn">
										<Icon name="warning" size={12} />
										{warn}
									</small>
								)}
							</label>
							{request.folder && (
								<FolderPicker
									tree={request.folder.tree}
									roots={[]}
									base={request.folder.base}
									value={folder}
									onPick={pickFolder}
									onCreateFolder={request.folder.onCreateFolder}
								/>
							)}
						</>
					) : request.kind === "form" ? (
						<>
							{request.message && <p>{request.message}</p>}
							{request.points && request.points.length > 0 && (
								<ul className="dialog-points">
									{request.points.map((point) => (
										<li key={point}>{point}</li>
									))}
								</ul>
							)}
							<div className="settings-box dialog-fields">
								{request.fields.map((field) => {
									const help = field.help ?? "";
									const set = (value: string | boolean) =>
										setAnswers({ ...answers, [field.id]: value });
									if (field.kind === "text") {
										const box = (
											<input
												ref={input}
												className="tb"
												aria-label={field.label}
												value={String(answers[field.id])}
												onChange={(e) => set(e.target.value)}
											/>
										);
										const browse = field.browse;
										return (
											<Row key={field.id} label={field.label} help={help}>
												{browse ? (
													<span className="path-pick">
														{box}
														<button
															type="button"
															className="tb"
															onClick={() =>
																void browse(String(answers[field.id])).then(
																	(picked) => picked && set(picked),
																	() => undefined,
																)
															}
														>
															Choose…
														</button>
													</span>
												) : (
													box
												)}
											</Row>
										);
									}
									if (field.kind === "select") {
										return (
											<Row key={field.id} label={field.label} help={help}>
												<select
													className="tb"
													aria-label={field.label}
													value={String(answers[field.id])}
													onChange={(e) => set(e.target.value)}
												>
													{field.options.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</Row>
										);
									}
									if (field.kind === "choice" && segmentable(field.options)) {
										return (
											<Row key={field.id} label={field.label} help={help}>
												<span className="segmented" role="radiogroup" aria-label={field.label}>
													{field.options.map((option) => {
														const on = answers[field.id] === option.value;
														return (
															<button
																key={option.value}
																type="button"
																role="radio"
																aria-checked={on}
																className={on ? "on" : undefined}
																onClick={() => set(option.value)}
															>
																{option.script && (
																	<ScriptIcon
																		kind="nodescript"
																		realm={option.script}
																		size={15}
																		className={realmClass(option.script)}
																	/>
																)}
																{option.label}
															</button>
														);
													})}
												</span>
											</Row>
										);
									}
									if (field.kind === "choice") {
										return (
											<fieldset key={field.id} className="setting dialog-choices">
												<legend>{field.label}</legend>
												{field.options.map((option) => (
													<label
														key={option.value}
														className={cx(
															"dialog-option",
															answers[field.id] === option.value && "on",
														)}
													>
														<input
															type="radio"
															name={field.id}
															checked={answers[field.id] === option.value}
															onChange={() => set(option.value)}
														/>
														{option.script && (
															<ScriptIcon
																kind="nodescript"
																realm={option.script}
																size={15}
																className={realmClass(option.script)}
															/>
														)}
														{option.label}
													</label>
												))}
											</fieldset>
										);
									}
									const on = offered(field) && answers[field.id] === true;
									return (
										<Row
											key={field.id}
											label={field.label}
											help={offered(field) ? help : "Not offered with what is chosen above."}
										>
											<Toggle
												on={on}
												label={on ? "On" : "Off"}
												disabled={!offered(field)}
												onChange={set}
											/>
										</Row>
									);
								})}
							</div>
						</>
					) : request.message ? (
						<p>{request.message}</p>
					) : null}
					{request.kind === "confirm" && request.checklist && (
						<div className="dialog-checklist">
							{[true, false].map((ok) => {
								const rows = request.checklist?.rows.filter((r) => r.ok === ok) ?? [];
								if (rows.length === 0) return null;
								return (
									<Fragment key={String(ok)}>
										<div className="checklist-head">
											{ok ? request.checklist?.done : request.checklist?.kept}
											<span className="checklist-count">{rows.length}</span>
										</div>
										{rows.map((r) => (
											<div key={r.name} className={cx("checklist-row", ok ? "ok" : "kept")}>
												<span className="checklist-mark" aria-hidden>
													{ok ? "✓" : "–"}
												</span>
												<span className="checklist-name">{r.name}</span>
												<span className="checklist-note">{r.note}</span>
											</div>
										))}
									</Fragment>
								);
							})}
						</div>
					)}
					{request.kind === "confirm" && request.diff && request.diff.length > 0 && (
						<pre className="dialog-diff">
							{request.diff.map((line, i) =>
								line.kind === "gap" ? (
									<span key={i} className="diff-gap">
										{`… ${line.count} unchanged line${line.count === 1 ? "" : "s"}\n`}
									</span>
								) : (
									<span key={i} className={`diff-${line.kind}`}>
										{`${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "} ${line.text}\n`}
									</span>
								),
							)}
						</pre>
					)}
					{request.kind === "confirm" && request.points && request.points.length > 0 && (
						<ul className="dialog-points">
							{request.points.map((point) => (
								<li key={point}>{point}</li>
							))}
						</ul>
					)}
					{items && items.length > 0 && (
						<ul className="dialog-list">
							{items.map((item) => {
								const { name, dir } = splitPath(item);
								return (
									<li key={item} title={item}>
										<Icon name={itemIcon(item)} size={13} />
										<span className="dialog-item-name">{name}</span>
										{dir && <span className="dialog-item-dir">{dir}</span>}
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<div className="dialog-actions">
					<span className="dialog-keys">
						{request.kind === "notice" ? (
							<>
								<kbd>Enter</kbd> or <kbd>Esc</kbd> to close
							</>
						) : (
							<>
								<kbd>Enter</kbd> to confirm · <kbd>Esc</kbd> to cancel
							</>
						)}
					</span>
					{request.kind !== "notice" && (
						<button className="tb" onClick={cancel}>
							Cancel
						</button>
					)}
					{request.kind === "choice" &&
						request.choices.map((choice) => (
							<button
								key={choice.value}
								className={cx("tb", choice.primary && "primary")}
								autoFocus={choice.primary}
								onClick={() => resolve(choice.value)}
							>
								{choice.label}
							</button>
						))}
					{request.kind !== "choice" && (
						<button
							className={cx("tb primary", request.kind === "confirm" && request.danger && "danger")}
							autoFocus={request.kind !== "prompt"}
							onClick={accept}
						>
							{request.kind === "notice"
								? "OK"
								: (request.confirmLabel ?? (request.kind === "prompt" ? "Create" : "Confirm"))}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
