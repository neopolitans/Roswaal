/**
 * In-app prompts and confirmations.
 *
 * Replaces window.prompt and window.confirm. Native dialogs cannot be styled,
 * cannot be themed, and — the reason this exists — block the whole renderer
 * while they are open, which makes the app unresponsive to anything but a
 * human hand. An in-app modal is a few lines more and behaves.
 */

import { useEffect, useRef, useState } from "react";
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
	| { kind: "notice"; title: string; message: string };

/** A prompt resolves to its text or null; a confirm to true or false. */
export type DialogResult = string | boolean | null;

export interface PendingDialog {
	request: DialogRequest;
	resolve: (result: DialogResult) => void;
}

export function Dialog({ request, resolve }: PendingDialog) {
	const [text, setText] = useState(request.kind === "prompt" ? (request.value ?? "") : "");
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Select rather than just focus, so typing replaces a suggested name.
		input.current?.focus();
		input.current?.select();
	}, []);

	function cancel() {
		resolve(request.kind === "prompt" ? null : false);
	}

	function accept() {
		if (request.kind === "prompt") resolve(text.trim() === "" ? null : text.trim());
		else resolve(true);
	}

	return (
		<div
			className="dialog-backdrop"
			style={{ zIndex: LAYER.menu + 1 }}
			onPointerDown={cancel}
		>
			<div
				className="dialog"
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
					<button
						className={`tb primary${request.kind === "confirm" && request.danger ? " danger" : ""}`}
						autoFocus={request.kind !== "prompt"}
						onClick={accept}
					>
						{request.kind === "notice"
							? "OK"
							: (request.confirmLabel ?? (request.kind === "prompt" ? "Create" : "Confirm"))}
					</button>
				</div>
			</div>
		</div>
	);
}
