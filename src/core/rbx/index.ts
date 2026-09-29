/**
 * Reading a Roblox place or model, whichever of the four formats it is in.
 *
 * The format is read off the bytes, not the file name: a `.rbxl` renamed to
 * `.rbxm` is still a binary place, and Studio does not care what it is called
 * either.
 */

import { isBinaryRbx, readBinary } from "./binary.js";
import { type RbxDocument, RbxError } from "./dom.js";
import { readXml } from "./xml.js";

export * from "./dom.js";

/** File extensions a place or model can have. */
export const PLACE_EXTENSIONS = [".rbxl", ".rbxlx", ".rbxm", ".rbxmx"] as const;

export function readRbx(bytes: Uint8Array): RbxDocument {
	if (isBinaryRbx(bytes)) return readBinary(bytes);
	const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
	if (head.startsWith("<roblox") || head.startsWith("<?xml")) return readXml(new TextDecoder().decode(bytes));
	throw new RbxError("not a Roblox place or model");
}
