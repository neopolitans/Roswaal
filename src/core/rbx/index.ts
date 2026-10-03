/**
 * Reading a Roblox place or model, whichever of the four formats it is in.
 *
 * The format is read off the bytes, not the file name: a `.rbxl` renamed to
 * `.rbxm` is still a binary place, and Studio does not care what it is called
 * either.
 */

import { isBinaryRbx, readBinary } from "./binary.js";
import { asRbxError, type RbxDocument, RbxError } from "./dom.js";
import { readXml } from "./xml.js";

export {
	asRbxError, type CFrameValue, isScript, pathOf, type Prop, type PropType, type RbxDocument, RbxError,
	type RbxInstance, SCRIPT_CLASSES, stringProp, text, walk,
} from "./dom.js";

/** File extensions a place or model can have. */
export const PLACE_EXTENSIONS = [".rbxl", ".rbxlx", ".rbxm", ".rbxmx"] as const;

/** Reads a place or model in any of the four formats. Throws `RbxError`, and nothing else. */
export function readRbx(bytes: Uint8Array): RbxDocument {
	try {
		if (isBinaryRbx(bytes)) return readBinary(bytes);
		const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
		if (head.startsWith("<roblox") || head.startsWith("<?xml")) return readXml(new TextDecoder().decode(bytes));
	} catch (error) {
		throw asRbxError(error, "the file is damaged");
	}
	throw new RbxError("not a Roblox place or model");
}
