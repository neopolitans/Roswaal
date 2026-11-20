/**
 * Add a package: one window for the three ways in. From Wally names a
 * package on the registry; Zip takes a package's zip, a Wally package or code
 * to vendor; GitHub vendors a repository. Under them, the name the project
 * requires it by and the realm, which says where the realm lands in Studio.
 *
 * In the modal shell every window shares (ModalParts), with the fields as
 * Settings rows. What adding does is the caller's: this only collects it.
 */

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { WallyRealm } from "../core/wally.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import { ModalHead, ModalKeys } from "./ModalParts.jsx";
import { Row } from "./settingsParts.jsx";

export type PackageSource = "wally" | "zip" | "github";

export interface AddPackageAnswer {
	source: PackageSource;
	/** `scope/name[@version]` from Wally, or `owner/repo[@branch]` from GitHub. */
	spec: string;
	/** The zip, from Zip. */
	file?: File;
	/** The name it is required by, when one was given. */
	alias?: string;
	realm: WallyRealm;
}

const REALMS: { id: WallyRealm; label: string; folder: string }[] = [
	{ id: "shared", label: "Shared", folder: "Packages" },
	{ id: "server", label: "Server", folder: "ServerPackages" },
	{ id: "dev", label: "Dev", folder: "DevPackages" },
];

const SOURCES: { id: PackageSource; label: string }[] = [
	{ id: "wally", label: "From Wally" },
	{ id: "zip", label: "Zip" },
	{ id: "github", label: "GitHub" },
];

/** Where a realm's folder lands in Studio: autosync's place, else the first map that syncs it. */
export function realmLanding(
	tree: readonly TreeEntry[],
	packageSync: Partial<Record<WallyRealm, string>> | undefined,
	realm: WallyRealm,
): string {
	const folder = REALMS.find((one) => one.id === realm)?.folder ?? "Packages";
	const kept = packageSync?.[realm];
	if (kept) return `Lands in ${kept.split(".").join(" › ")}, kept there by autosync.`;
	const maps: TreeEntry[] = [];
	const visit = (entries: readonly TreeEntry[]) => {
		for (const entry of entries) {
			if (entry.kind === "nodemap") maps.push(entry);
			if (entry.children) visit(entry.children);
		}
	};
	visit(tree);
	// The served map first: it is the one Rojo reads.
	maps.sort((a, b) => Number(b.mapFacts?.serves === true) - Number(a.mapFacts?.serves === true));
	for (const map of maps) {
		const found = map.mapFacts?.syncs.find((one) => one.path === folder);
		if (found) return `Lands in ${found.trail}, synced by ${map.name.replace(/\.nodemap$/, "")}.`;
	}
	return `No map syncs ${folder}/ yet. Turn on autosync for it under Packages.`;
}

export function AddPackageDialog({
	initial,
	canGithub,
	notHere,
	landing,
	onClose,
	onAdd,
}: {
	initial?: { source?: PackageSource; realm?: WallyRealm };
	canGithub: boolean;
	/** Why GitHub is not offered here. */
	notHere: string;
	landing: (realm: WallyRealm) => string;
	onClose: () => void;
	onAdd: (answer: AddPackageAnswer) => void;
}) {
	const [source, setSource] = useState<PackageSource>(initial?.source ?? "wally");
	const [spec, setSpec] = useState("");
	const [repo, setRepo] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [alias, setAlias] = useState("");
	const [realm, setRealm] = useState<WallyRealm>(initial?.realm ?? "shared");
	const picker = useRef<HTMLInputElement>(null);

	const ready =
		source === "wally"
			? /^\s*[\w.-]+\/[\w.-]+(@\S+)?\s*$/.test(spec)
			: source === "zip"
				? file !== null
				: canGithub && /^\s*(https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+(@\S+)?\s*$/.test(repo);

	const add = () => {
		if (!ready) return;
		onAdd({
			source,
			spec: (source === "github" ? repo : spec).trim(),
			...(source === "zip" && file ? { file } : {}),
			...(alias.trim() ? { alias: alias.trim() } : {}),
			realm: source === "github" ? "shared" : realm,
		});
	};

	// Into the page itself: the Project panel it is opened from holds fixed positioning.
	return createPortal(
		<div className="dialog-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={onClose}>
			<div
				className="dialog dialog-panel dialog-accent"
				role="dialog"
				aria-modal="true"
				aria-label="Add a package"
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
					}
					if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
						e.preventDefault();
						add();
					}
				}}
			>
				<ModalHead
					icon="instance"
					title="Add a package"
					sub="Installs with what it depends on"
					closeLabel="Cancel"
					onClose={onClose}
				/>
				<div className="dialog-body">
					<div className="settings-box dialog-fields">
						<Row label="Source" help="Wally's registry, a zip you have, or a GitHub repository.">
							<span className="segmented" role="radiogroup" aria-label="Source">
								{SOURCES.map((one) => {
									const off = one.id === "github" && !canGithub;
									return (
										<button
											key={one.id}
											type="button"
											role="radio"
											aria-checked={source === one.id}
											className={cx(source === one.id && "on")}
											disabled={off}
											title={off ? notHere : undefined}
											onClick={() => setSource(one.id)}
										>
											{one.label}
										</button>
									);
								})}
							</span>
						</Row>
						{source === "wally" && (
							<Row label="Package" help="scope/name, or scope/name@version">
								<input
									className="tb"
									aria-label="Package"
									// biome-ignore lint/a11y/noAutofocus: the window opens to be typed into.
									autoFocus
									placeholder="sleitnick/signal"
									value={spec}
									onChange={(e) => setSpec(e.target.value)}
								/>
							</Row>
						)}
						{source === "zip" && (
							<Row
								label="Zip"
								help="A Wally package installs as one; anything else is vendored into Packages/."
							>
								<span className="add-package-file">
									<button type="button" className="tb" onClick={() => picker.current?.click()}>
										<Icon name="folderOpen" size={14} />
										{file ? "Another…" : "Choose…"}
									</button>
									{file && <span className="add-package-name">{file.name}</span>}
									<input
										ref={picker}
										type="file"
										accept=".zip,application/zip"
										hidden
										onChange={(e) => {
											const chosen = e.target.files?.[0];
											e.target.value = "";
											if (chosen) setFile(chosen);
										}}
									/>
								</span>
							</Row>
						)}
						{source === "github" && (
							<Row
								label="Repository"
								help="owner/repo, or owner/repo@branch. Vendored into Packages/, not added to wally.toml."
							>
								<input
									className="tb"
									aria-label="Repository"
									// biome-ignore lint/a11y/noAutofocus: the window opens to be typed into.
									autoFocus
									placeholder="owner/repo"
									value={repo}
									onChange={(e) => setRepo(e.target.value)}
								/>
							</Row>
						)}
						<Row label="Required as" help="Optional. The name scripts require it by.">
							<input
								className="tb"
								aria-label="Required as"
								value={alias}
								onChange={(e) => setAlias(e.target.value)}
							/>
						</Row>
						{source !== "github" && (
							<Row label="Realm" help={landing(realm)}>
								<span className="segmented" role="radiogroup" aria-label="Realm">
									{REALMS.map((one) => (
										<button
											key={one.id}
											type="button"
											role="radio"
											aria-checked={realm === one.id}
											className={cx(realm === one.id && "on")}
											title={`${one.folder}/`}
											onClick={() => setRealm(one.id)}
										>
											{one.label}
										</button>
									))}
								</span>
							</Row>
						)}
					</div>
				</div>
				<div className="dialog-actions">
					<ModalKeys
						keys={[
							["Enter", "add"],
							["Esc", "cancel"],
						]}
					/>
					<button type="button" className="tb" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="tb primary" disabled={!ready} onClick={add}>
						Add
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
