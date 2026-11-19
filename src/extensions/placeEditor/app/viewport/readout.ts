/**
 * The corner readout while the renderer starts: which one, and how much of
 * its shaders has compiled, as "Starting (WebGPU – Shaders 70%)".
 */
export function startingText(backend: string | null, shaders: number | null): string {
	const name = backend ?? "…";
	if (shaders === null) return `Starting (${name})`;
	// Down, so 100% is only ever all of them; the nudge keeps 0.29 from flooring to 28.
	const percent = Math.floor(Math.max(0, Math.min(1, shaders)) * 100 + 1e-9);
	return `Starting (${name} – Shaders ${percent}%)`;
}
