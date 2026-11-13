/**
 * The notice of the Terms of Service and Privacy Policy, over the editor and
 * Node Design: on a first visit, and again when either page changes. Not over
 * the docs, where the pages themselves are.
 *
 * Drawn as the editor's dialogs are, but its own component: a dialog's message
 * is plain text, and this one's job is two links.
 */

import { useState } from "react";

import { LEGAL_EDITED } from "../core/docs/pages/legal.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import { legalNoticeState, readLegalSeen, rememberLegalSeen } from "./legalSeen.js";
import { pageHref } from "./pages.js";

const storage = typeof localStorage === "undefined" ? undefined : localStorage;

export function LegalNotice() {
	const [state, setState] = useState(() => legalNoticeState(readLegalSeen(storage)));
	if (state === null) return null;
	const close = () => {
		rememberLegalSeen(storage);
		setState(null);
	};
	return (
		<div className="dialog-backdrop" style={{ zIndex: LAYER.menu + 2 }}>
			<div
				className="dialog dialog-panel dialog-info"
				role="dialog"
				aria-modal="true"
				aria-label="Terms of Service and Privacy Policy"
				// The editor's own shortcuts stand aside while it is open.
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter" || e.key === "Escape") {
						e.preventDefault();
						close();
					}
				}}
			>
				<header className="dialog-head">
					<span className="dialog-badge">
						<Icon name="document" size={17} />
					</span>
					<h3>{state === "first" ? "Before you start" : "The terms have changed"}</h3>
				</header>
				<div className="dialog-body">
					{state === "changed" && (
						<p>
							The Terms of Service were last edited on {LEGAL_EDITED.terms}, and the Privacy Policy
							on {LEGAL_EDITED.privacy}.
						</p>
					)}
					<p>
						Roswaal is free and collects nothing about you. Using it means agreeing to its{" "}
						<a href={pageHref("docs", "terms")} target="_blank" rel="noopener">
							Terms of Service
						</a>
						, and its{" "}
						<a href={pageHref("docs", "privacy")} target="_blank" rel="noopener">
							Privacy Policy
						</a>{" "}
						says what it keeps on your device.
					</p>
					<p>
						It is designed for people aged 18 and over. If you are younger, ask a parent or guardian
						first.
					</p>
				</div>
				<div className="dialog-actions">
					<span className="dialog-keys">
						<kbd>Enter</kbd> to continue
					</span>
					<button type="button" className="tb primary" autoFocus onClick={close}>
						I understand
					</button>
				</div>
			</div>
		</div>
	);
}
