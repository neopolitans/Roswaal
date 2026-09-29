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

export function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}
