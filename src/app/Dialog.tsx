/**
 * In-app prompts and confirmations.
 *
 * Replaces window.prompt and window.confirm. Native dialogs cannot be styled,
 * cannot be themed, and — the reason this exists — block the whole renderer
 * while they are open, which makes the app unresponsive to anything but a
 * human hand. An in-app modal is a few lines more and behaves.
 */

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx.js";
import { LAYER } from "./layers.js";

export type DialogRequest =
	| {
			kind: "prompt";
			title: string;
			label?: string;
			value?: string;
			placeholder?: string;
			confirmLabel?: string;
	  }
	| {
			kind: "confirm";
			title: string;
			message: string;
			/** Listed under the message: what the confirmation is about, by name. */
			items?: string[];
			confirmLabel?: string;
			danger?: boolean;
	  }
	| { kind: "notice"; title: string; message: string }
	| {
			/** One of several answers, each its own button. Resolves to its value, or null. */
			kind: "choice";
			title: string;
			message: string;
			choices: { value: string; label: string; primary?: boolean }[];
	  }
	| {
			/** Several answers at once. Resolves to `FormAnswers` as JSON, or null. */
			kind: "form";
			title: string;
			message: string;
			fields: FormField[];
			confirmLabel?: string;
	  };

export type FormField =
	| { id: string; kind: "text"; label: string; value: string }
	| { id: string; kind: "choice"; label: string; value: string; options: { value: string; label: string }[] }
	/** One of however many, as a dropdown: a list that could be long. */
	| { id: string; kind: "select"; label: string; value: string; options: { value: string; label: string }[] }
	| {
			id: string;
			kind: "check";
			label: string;
			value: boolean;
			/** Only offered while another field has this answer. */
			when?: { id: string; value: string };
	  };

export type FormAnswers = Record<string, string | boolean>;

/** A prompt resolves to its text or null; a confirm to true or false. */
export type DialogResult = string | boolean | null;

export interface PendingDialog {
	request: DialogRequest;
	resolve: (result: DialogResult) => void;
}

export function Dialog({ request, resolve }: PendingDialog) {
	const [text, setText] = useState(request.kind === "prompt" ? (request.value ?? "") : "");
	const [answers, setAnswers] = useState<FormAnswers>(() =>
		request.kind === "form" ? Object.fromEntries(request.fields.map((f) => [f.id, f.value])) : {},
	);
	const offered = (field: FormField) =>
		field.kind !== "check" || !field.when || answers[field.when.id] === field.when.value;
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Select rather than just focus, so typing replaces a suggested name.
		input.current?.focus();
		input.current?.select();
	}, []);

	function cancel() {
		resolve(request.kind === "prompt" || request.kind === "form" || request.kind === "choice" ? null : false);
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
			for (const field of request.fields) out[field.id] = offered(field) ? answers[field.id] : false;
			resolve(JSON.stringify(out));
		} else resolve(true);
	}

	return (
		<div
			className="dialog-backdrop"
			style={{ zIndex: LAYER.menu + 1 }}
			onPointerDown={cancel}
		>
			<div
				className="dialog"
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
				<h3>{request.title}</h3>

				{request.kind === "prompt" ? (
					<label className="field">
						{request.label && <span>{request.label}</span>}
						<input
							ref={input}
							className="tb"
							value={text}
							placeholder={request.placeholder}
							onChange={(e) => setText(e.target.value)}
						/>
					</label>
				) : request.kind === "form" ? (
					<>
						<p>{request.message}</p>
						{request.fields.map((field) => {
							if (field.kind === "text") {
								return (
									<label key={field.id} className="field">
										<span>{field.label}</span>
										<input
											ref={input}
											className="tb"
											value={String(answers[field.id])}
											onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
										/>
									</label>
								);
							}
							if (field.kind === "select") {
								return (
									<label key={field.id} className="field">
										<span>{field.label}</span>
										<select
											className="tb"
											value={String(answers[field.id])}
											onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
										>
											{field.options.map((option) => (
												<option key={option.value} value={option.value}>{option.label}</option>
											))}
										</select>
									</label>
								);
							}
							if (field.kind === "choice") {
								return (
									<fieldset key={field.id} className="dialog-choices">
										<legend>{field.label}</legend>
										{field.options.map((option) => (
											<label key={option.value} className="dialog-option">
												<input
													type="radio"
													name={field.id}
													checked={answers[field.id] === option.value}
													onChange={() => setAnswers({ ...answers, [field.id]: option.value })}
												/>
												{option.label}
											</label>
										))}
									</fieldset>
								);
							}
							return (
								<label
									key={field.id}
									className={cx("dialog-option", !offered(field) && "dialog-option-off")}
								>
									<input
										type="checkbox"
										disabled={!offered(field)}
										checked={offered(field) && answers[field.id] === true}
										onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.checked })}
									/>
									{field.label}
								</label>
							);
						})}
					</>
				) : (
					<>
						<p>{request.message}</p>
						{request.kind === "confirm" && request.items && request.items.length > 0 && (
							<ul className="dialog-list">
								{request.items.map((item) => <li key={item}>{item}</li>)}
							</ul>
						)}
					</>
				)}

				<div className="dialog-actions">
					{request.kind !== "notice" && (
						<button className="tb" onClick={cancel}>
							Cancel
						</button>
					)}
					{request.kind === "choice" && request.choices.map((choice) => (
						<button
							key={choice.value}
							className={cx("tb", choice.primary && "primary")}
							autoFocus={choice.primary}
							onClick={() => resolve(choice.value)}
						>
							{choice.label}
						</button>
					))}
					{request.kind !== "choice" && <button
						className={cx(
							"tb primary",
							request.kind === "confirm" && request.danger && "danger",
						)}
						autoFocus={request.kind !== "prompt"}
						onClick={accept}
					>
						{request.kind === "notice"
							? "OK"
							: (request.confirmLabel ?? (request.kind === "prompt" ? "Create" : "Confirm"))}
					</button>}
				</div>
			</div>
		</div>
	);
}
