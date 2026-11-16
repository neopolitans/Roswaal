/**
 * Bytes as base64 and back, for the one place binary data crosses JSON: a
 * place or model in a project export. `btoa` and `atob` exist in Node, the
 * browser and a worker alike.
 */

export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	// In slices: spreading megabytes into one call overflows the stack.
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** The browser's own decoder, where it has one: many times quicker on a place's buffers. */
const nativeFromBase64 = (Uint8Array as { fromBase64?: (text: string) => Uint8Array }).fromBase64;

export function fromBase64(text: string): Uint8Array {
	if (nativeFromBase64) return nativeFromBase64.call(Uint8Array, text);
	return fromBase64ByHand(text);
}

/** `fromBase64` where there is no native decoder. Exported for its test. */
export function fromBase64ByHand(text: string): Uint8Array {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}
