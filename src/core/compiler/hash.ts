/** The hash written into a generated file's header. */

/**
 * FNV-1a, widened to 64 bits. Dependency-free so the browser and the server
 * compute identical hashes, which is what makes stale-output detection work.
 */
export function hashString(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 ^= c;
		h1 = Math.imul(h1, 0x01000193) >>> 0;
		h2 ^= c + i;
		h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
