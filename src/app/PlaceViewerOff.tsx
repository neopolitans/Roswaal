/**
 * What a place's tab shows when the place viewer is not drawing it: a moment
 * while it loads, or, with Settings › Extended Features › Place viewer off,
 * that it is off and how to turn it on. The place itself is still in the
 * DataModel tree and Properties either way.
 */

export function PlaceViewerOff({ loading, onTurnOn }: { loading: boolean; onTurnOn: () => void }) {
	if (loading) {
		return (
			<div className="placeholder">
				<p>Loading the place viewer…</p>
			</div>
		);
	}
	return (
		<div className="placeholder">
			<h1>The place viewer is off</h1>
			<p>
				Its 3D view is not loaded, to save memory. The place's instances are still in the DataModel
				tree, and you can edit them in Properties.
			</p>
			<p>
				<button type="button" className="tb primary" onClick={onTurnOn}>
					Turn it on
				</button>
			</p>
		</div>
	);
}
