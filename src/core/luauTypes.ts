/**
 * Luau's own types, which every runtime has.
 *
 * One list for the type picker, the pins, the compiler and the node menu, in
 * its own module so each can read it without the Roblox or Lune catalogues.
 * Written out more than once, it lost a type each time: `buffer`, `thread` and
 * `nil` were missing from one copy, and `unknown` and `never` until 0.74.3.
 * `buffer` was still missing from the type picker's Luau heading until 0.221.2
 * (RFC: https://rfcs.luau.org/type-byte-buffer.html).
 */
export const LUAU_PRIMITIVES = [
	"any",
	"unknown",
	"never",
	"boolean",
	"number",
	"string",
	"table",
	"function",
	"thread",
	"buffer",
	"nil",
];
