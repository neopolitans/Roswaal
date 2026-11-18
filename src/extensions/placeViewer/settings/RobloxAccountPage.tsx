/**
 * Settings › Roblox account: Sign in with Roblox and what it downloaded. A
 * page of the Place Viewer's own, because signing in and clearing downloads
 * are actions rather than settings.
 *
 * Before Roblox's own page, what is asked for, where it is kept, how to
 * remove it, and a word for anyone under 18 -- the screen the sign-in research
 * asked for. The sign-in itself is the daemon's; this never sees a token.
 */

import { useCallback, useEffect, useState } from "react";

import { pageHref } from "../../../app/pages.js";
import { Group, Row } from "../../../app/settingsParts.jsx";
import { robloxApi } from "../app/robloxApi.js";
import { signOutOfRoblox, startRobloxSignIn, useRobloxStatus } from "./robloxAccount.js";

export function RobloxAccountPage() {
	const status = useRobloxStatus();
	const [explaining, setExplaining] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!status.available) {
		return (
			<Group title="Sign in with Roblox">
				<Row
					label="Not on the website"
					help="Sign in with Roblox is offered by Roswaal on your computer. Here, meshes and images are drawn as stand-ins."
				/>
			</Group>
		);
	}

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Group title="Sign in with Roblox">
			{status.signedIn ? (
				<>
					<Row
						label={`Signed in as Roblox user ${status.userId ?? ""}`}
						help="Signing out ends the sign-in on Roblox and deletes what it downloaded."
					>
						<button
							type="button"
							className="tb"
							disabled={busy}
							onClick={() => void run(signOutOfRoblox)}
						>
							Sign out
						</button>
					</Row>
					<DownloadedAssetsRow />
				</>
			) : explaining ? (
				<div className="setting roblox-consent">
					<div className="setting-label">
						<strong>Before you continue to Roblox</strong>
						<ul className="dialog-points">
							<li>
								Roblox asks you to let Roswaal download assets, read who made an asset, and know
								your Roblox user ID. Nothing else: not your name, avatar or friends.
							</li>
							<li>
								The sign-in stays on this computer, readable only by your account, and encrypted on
								Windows. It never goes into a project, this tab or a log.
							</li>
							<li>
								Meshes and images Roswaal downloads stay in the project's <code>.roswaal</code>{" "}
								folder, out of Git, and are never shared.
							</li>
							<li>
								Sign out here at any time. It ends the sign-in on Roblox and deletes what was
								downloaded.
							</li>
							<li>
								<strong>Under 18?</strong> Ask a parent or guardian before you sign in.
							</li>
						</ul>
						<span>
							More in the{" "}
							<a href={pageHref("docs", "privacy")} target="_blank" rel="noopener">
								Privacy Policy
							</a>
							.
						</span>
						<div className="roblox-consent-actions">
							<button type="button" className="tb" onClick={() => setExplaining(false)}>
								Cancel
							</button>
							<button
								type="button"
								className="tb primary"
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await startRobloxSignIn();
										setExplaining(false);
									})
								}
							>
								Continue to Roblox
							</button>
						</div>
					</div>
				</div>
			) : (
				<Row
					label={status.signingIn ? "Waiting for Roblox" : "Not signed in"}
					help={
						status.signingIn
							? "Finish signing in on Roblox's page, in the tab that opened."
							: "Optional. Draws the meshes and images your places use from the Creator Marketplace. Everything else works without it."
					}
				>
					<button type="button" className="tb" onClick={() => setExplaining(true)}>
						{status.signingIn ? "Start again" : "Sign in…"}
					</button>
				</Row>
			)}
			{(error ?? status.failed) && <p className="settings-note">{error ?? status.failed}</p>}
		</Group>
	);
}

/**
 * What the open project holds from Sign in with Roblox, and a way to delete it.
 * Unused assets go by themselves after 30 days.
 */
function DownloadedAssetsRow() {
	const [held, setHeld] = useState<{ count: number; bytes: number } | null>(null);
	const [busy, setBusy] = useState(false);
	const load = useCallback(() => {
		robloxApi.assets().then(
			(answer) => setHeld(answer.available ? answer : null),
			() => setHeld(null),
		);
	}, []);
	useEffect(load, [load]);
	if (!held) return null;
	const size =
		held.bytes < 1024 * 1024
			? `${Math.ceil(held.bytes / 1024)} KB`
			: `${(held.bytes / 1024 / 1024).toFixed(1)} MB`;
	return (
		<Row
			label="Downloaded assets"
			help={
				held.count === 0
					? "None in this project. Any not used for 30 days are deleted by themselves."
					: `${held.count} in this project, ${size}, out of Git. Any not used for 30 days are deleted by themselves.`
			}
		>
			<button
				type="button"
				className="tb"
				disabled={busy || held.count === 0}
				onClick={() => {
					setBusy(true);
					robloxApi
						.clearAssets()
						.then(load, load)
						.finally(() => setBusy(false));
				}}
			>
				Clear
			</button>
		</Row>
	);
}
