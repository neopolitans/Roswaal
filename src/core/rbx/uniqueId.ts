/**
 * A UniqueId, written one way whichever file it came from.
 *
 * Studio keeps the same identity in two layouts. Its XML writes the random
 * part, then the time, then the index, as 32 hex digits. Its binary writes the
 * index, then the time, then the random part zigzagged, transposed with every
 * other instance's. Roswaal holds the XML spelling, so an instance converted
 * from one format to the other keeps the identity Studio gave it; it once
 * carried the binary bytes across unchanged, and every converted id differed.
 */

/** The XML spelling, from the 16 bytes the binary holds for one id. */
export function uniqueIdFromBinary(bytes: ArrayLike<number>): string {
	const hex = (from: number, to: number) => {
		let out = "";
		for (let k = from; k < to; k++) out += bytes[k].toString(16).padStart(2, "0");
		return out;
	};
	const zigzagged = BigInt(`0x${hex(8, 16)}`);
	const random = BigInt.asUintN(64, (zigzagged >> 1n) ^ -(zigzagged & 1n));
	return random.toString(16).padStart(16, "0") + hex(4, 8) + hex(0, 4);
}

/** The 16 bytes the binary holds for an id in the XML spelling. */
export function uniqueIdToBinary(id: string): Uint8Array {
	const hex = id.padStart(32, "0").slice(-32);
	const random = BigInt.asIntN(64, BigInt(`0x${hex.slice(0, 16)}`));
	const zigzagged = BigInt.asUintN(64, (random << 1n) ^ (random >> 63n));
	const ordered = hex.slice(24, 32) + hex.slice(16, 24) + zigzagged.toString(16).padStart(16, "0");
	const out = new Uint8Array(16);
	for (let k = 0; k < 16; k++) out[k] = parseInt(ordered.slice(2 * k, 2 * k + 2), 16);
	return out;
}

/**
 * The id as Roswaal spelled it before 0.200.1 for a binary place: its 16
 * bytes as they stand. A link written then names a script by it.
 */
export function legacyBinaryUniqueId(id: string): string {
	return [...uniqueIdToBinary(id)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
