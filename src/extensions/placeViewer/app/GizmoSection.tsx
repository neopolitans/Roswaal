/**
 * Gizmos: the Rendering panel's switches for what `visualGizmos.ts` draws
 * over the view -- Attachments, constraints, welds, and what is picked. A
 * group of its own, for the panel to mount; the view's alone, for the session.
 */

import { useSyncExternalStore } from "react";
import { SectionHead, useFold } from "../../../app/PanelParts.jsx";
import type { ViewportController } from "./viewport/controller.js";
import { GIZMO_SWITCHES } from "./viewport/visualGizmos.js";

export function GizmoSection({ controller }: { controller: ViewportController }) {
	const { gizmos } = useSyncExternalStore(controller.subscribe, controller.getState);
	const [open, toggle] = useFold(false);
	return (
		<div className="place-group">
			<SectionHead title="Gizmos" open={open} onToggle={toggle} />
			{open &&
				GIZMO_SWITCHES.map(([key, label]) => (
					<label className="render-switch" key={key}>
						<span>{label}</span>
						<input
							type="checkbox"
							checked={gizmos[key]}
							onChange={(e) => controller.setGizmos({ ...gizmos, [key]: e.target.checked })}
						/>
					</label>
				))}
		</div>
	);
}
