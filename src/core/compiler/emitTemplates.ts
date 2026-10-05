/**
 * Template rendering: a node's `compilesTo` text with its placeholders filled
 * — `$in`, `$out`, `$args`, `$more`, `$opt`, `$pairs`, `$index`, `$config` — and
 * the statement nodes and interpolated strings built on it.
 *
 * Functions of the `Emitter` they write through; see `emitter.ts`.
 */

import type { Literal, NodeConfig, PinDef } from "../schema.js";
import { partPinId } from "../structs.js";
import { type Scope, VARIADIC_PIN } from "./emitScope.js";
import type { Emitter } from "./emitter.js";
import type { ResolvedNode } from "./graph.js";
import {
	foldPrecedence,
	isAccessPath,
	isFieldName,
	parenAt,
	parenPrefix,
	spliceIntoTemplate,
	toIdentifier,
} from "./luau.js";

/**
 * The name inside a rendered key, when the key can be written without brackets.
 *
 * `t["tuning"]` and `t.tuning` are the same table access, and Luau accepts
 * both — but only one of them is what anybody writes, and the generated file is
 * meant to be read beside hand-written Luau. Returns null whenever the short
 * form would change the meaning or not compile: a computed key, a key with a
 * space in it, a number, a keyword.
 *
 * `continue` is bracketed as well, though it is contextual in Luau and
 * `t.continue` compiles. Bracketing it costs three characters in a file nobody
 * will notice, and the alternative is being subtly wrong about a keyword list
 * if Luau ever tightens one.
 */
function plainKey(rendered: string): string | null {
	const name = /^"([^"\\]*)"$/.exec(rendered)?.[1];
	return name !== undefined && isFieldName(name) && name !== "continue" ? name : null;
}

/**
 * Whether this node was told to write every key in brackets.
 *
 * A setting rather than a rule, because both forms are ordinary Luau and
 * which one reads better depends on the table: a settings table wants
 * `tuning.turnRate`, and a table keyed by names that only happen to be
 * identifiers today wants the brackets it will still need tomorrow.
 */
function bracketsOnly(r: ResolvedNode): boolean {
	return r.node.config?.keys === "brackets";
}

/**
 * A statement node, whose data outputs are locals the template assigns to.
 *
 * ## Why every *referenced* output is declared, not every consumed one
 *
 * A node returning several values assigns to all of them at once —
 * `$out.h, $out.s, $out.v = $in.color:ToHSV()` — whether or not anything is
 * wired to each. Declaring only the consumed ones would leave the rest as
 * bare names on the left of an assignment, which in Luau creates **globals**:
 * silent, and the sort of bug that turns up as one script writing over
 * another's state weeks later.
 *
 * So the template is scanned, and an output it mentions is declared even
 * when nothing reads it. An unread one binds to `_`, which is the Lua idiom
 * for a value being deliberately dropped and keeps the positions lined up —
 * `local value, _, _` is exactly as long as the assignment needs to be.
 *
 * Nothing in the built-in library relies on this yet: the datatype nodes
 * that return several values are pure and use `select`, because a colour
 * conversion should not be an execution step. It is here so that the next
 * node that does need it finds working machinery rather than a trap.
 */
export function emitStatement(
	e: Emitter,
	r: ResolvedNode,
	template: string,
	scope: Scope,
): string | undefined {
	const referenced = new Set(
		[...template.matchAll(/\$out\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
	);
	const outs = r.baseOutputs.filter(
		(p) =>
			p.kind === "data" &&
			(e.index.readerCount(r.node.id, p.id, { parts: true }) > 0 || referenced.has(p.id)),
	);

	const idents: string[] = [];
	for (const pin of outs) {
		const consumed = e.index.readerCount(r.node.id, pin.id, { parts: true }) > 0;
		const ident = consumed ? e.names.unique(pin.name || pin.id, "value") : "_";
		// Bound either way. An unconsumed one still has to resolve to
		// something the template can assign to, and leaving it unbound is
		// what sent it to a global in the first place.
		scope.bindings.set(`${r.node.id}/${pin.id}`, ident);
		idents.push(ident);
	}
	if (idents.length > 0) e.push(`local ${idents.join(", ")}`, r.node.id);

	const rendered = renderTemplate(e, r, template, scope);
	if (rendered.trim() !== "") e.push(rendered, r.node.id);
	return e.index.execTarget(r.node.id, "then");
}

/**
 * Has this pin been given a value, as opposed to merely having a default?
 *
 * Only `$opt` asks, and the distinction is the whole point of an optional
 * pin: a literal the developer typed counts, a wire counts, a split counts,
 * and the definition's own `default` does not. A default is what the *call*
 * would have used anyway, so passing it explicitly is the thing an optional
 * pin exists to avoid.
 */
function isSet(e: Emitter, r: ResolvedNode, pin: PinDef): boolean {
	if (e.index.sourceOf(r.node.id, pin.id)) return true;
	if (e.splitOf(r, pin.id, "in")) return true;
	return r.node.literals?.[pin.id] !== undefined;
}

/**
 * A call's arguments, with the optional ones nobody set handled the one way
 * every call does it.
 *
 * Trailing unset optional arguments are left off, because the engine and
 * Lune both reject an explicit `nil` in places where they accept a missing
 * argument. One that is unset but followed by a set one is passed as `nil`,
 * since leaving it off would shift every argument after it.
 */
export function callArguments(
	e: Emitter,
	r: ResolvedNode,
	pins: readonly PinDef[],
	render: (pin: PinDef, index: number) => string,
): string[] {
	const set = pins.map((pin) => isSet(e, r, pin));
	let last = pins.length - 1;
	while (last >= 0 && pins[last].optional === true && !set[last]) last -= 1;
	return pins
		.slice(0, last + 1)
		.map((pin, index) => (pin.optional === true && !set[index] ? "nil" : render(pin, index)));
}

/**
 * Concatenate, written as Luau's interpolated string.
 *
 * `a .. " has no " .. name` and the interpolated form are the same string,
 * and which reads better depends on the line: a join of two values is
 * plainer as a join, and a sentence with three values in it is a sentence
 * with holes in it. So it is a setting on the node, as a pill's brackets
 * are, and the node carries the answer into everybody else's checkout.
 *
 * A part typed into the node is written as **text**, escaped where Luau's
 * interpolation needs it; anything wired in is written as a hole. A plain
 * string literal arriving down a wire is unwrapped, since a hole with a
 * constant in it is a hole the reader has to look through.
 */
export function interpolated(e: Emitter, r: ResolvedNode, scope: Scope): string {
	const parts: string[] = [];
	for (const pin of r.inputs.filter((p) => VARIADIC_PIN.test(p.id))) {
		const wired = e.index.sourceOf(r.node.id, pin.id) !== undefined;
		const literal = r.node.literals?.[pin.id] ?? pin.default;
		if (!wired && literal && literal.t === "string") {
			parts.push(escapeInterpolated(literal.v));
			continue;
		}
		const value = e.resolveInput(r, pin, scope);
		const plain = PLAIN_STRING.exec(value);
		parts.push(plain ? escapeInterpolated(plain[1]) : `{${value}}`);
	}
	return `\`${parts.join("")}\``;
}

/**
 * A pin a template reads more than once, worked out once.
 *
 * `x ~= x` is the NaN check, and its template names one pin twice — so
 * without this, the value arrives twice: `roll() ~= roll()` calls `roll`
 * two times and compares two different numbers, which is not the question
 * the node asks. Fanning out to two *pins* already binds a local; this is
 * the same rule for one pin read twice.
 *
 * An identifier or an access path is spliced as it is, for the reason
 * `resolveOutput` gives: `restore.weld` read twice is what the hand-written
 * module says, and a local for it is a snapshot rather than a shorthand.
 * A literal is left alone too — nothing is saved by naming `0`.
 *
 * Nothing is bound in a logic graph, which is one expression with nowhere
 * to put a local; there the value is worked out where it is read.
 */
function readOnce(
	e: Emitter,
	r: ResolvedNode,
	template: string,
	scope: Scope,
): Map<string, string> {
	const out = new Map<string, string>();
	if (e.options.expressionsOnly) return out;

	const counts = new Map<string, number>();
	for (const match of template.matchAll(/\$in\.([A-Za-z_][A-Za-z0-9_]*)(?![.\w!])/g)) {
		counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
	}

	for (const [pinId, count] of counts) {
		if (count < 2) continue;
		const pin = r.inputs.find((one) => one.id === pinId);
		if (!pin) continue;
		const expr = e.resolveInput(r, pin, scope);
		// A name, a literal or a field read: repeating it costs nothing and
		// reads as the hand-written line would. A call is not on this list,
		// however atomic it looks -- calling it twice is the bug.
		if (REPEATABLE.test(expr) || isAccessPath(expr)) {
			out.set(pinId, expr);
			continue;
		}
		// Named after what fed it, as `resolveOutput` names its locals: the
		// pin is unnamed on a pill, and `a` would be a local called after
		// the operand slot rather than after the value in it.
		const src = e.feederOf(r.node.id, pinId);
		const hint = src?.node.label || pin.name || src?.def.title || pinId;
		const ident = e.names.unique(hint, "value");
		e.push(`local ${ident} = ${expr}`, r.node.id);
		out.set(pinId, ident);
	}
	return out;
}

export function renderTemplate(
	e: Emitter,
	r: ResolvedNode,
	template: string,
	scope: Scope,
): string {
	// `$config.<key>` — a name the node carries rather than a pin it has.
	//
	// Get Member's member is the case: it is chosen from what the wired
	// type declares, drawn on the pill's face, and is not a value anything
	// can wire, so a pin for it would be a pin that only ever holds what
	// the picker put there. Written out as an identifier, and a key that is
	// missing or is not one leaves the template empty for the node's own
	// validation to report.
	template = template.replace(/\$config\.([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
		const value = r.node.config?.[key];
		const text = typeof value === "string" ? value.trim() : "";
		return isFieldName(text) ? text : "";
	});

	// `$args(<separator>)` folds every variadic input pin into one list, so a
	// node whose arity is chosen per instance still compiles from a static
	// template. Each operand is parenthesised, because the separator is
	// usually an operator and precedence has to survive.
	//
	// Through `callArguments`, so an optional argument left empty at the end is
	// left off, as every call node does. Only a wired call's pins are optional,
	// so for an operator this is the plain list it always was.
	template = template.replace(/\$args\(([^)]*)\)/g, (_match, separator: string) => {
		const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
		if (args.length === 0) return "";
		const needed = foldPrecedence(separator);
		return callArguments(e, r, args, (p, i) =>
			parenAt(e.resolveInput(r, p, scope), i === 0 ? needed.first : needed.rest),
		).join(separator);
	});

	// `$more(<sep>)` is `$args` with a leading separator when there is anything
	// to separate. It is what lets `Fire(player, a, b)` and `Fire(player)` come
	// from one template instead of forcing a payload nobody asked for.
	template = template.replace(/\$more\(([^)]*)\)/g, (_match, separator: string) => {
		const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
		if (args.length === 0) return "";
		const needed = foldPrecedence(separator);
		return (
			separator +
			args
				.map((p, i) => parenAt(e.resolveInput(r, p, scope), i === 0 ? needed.first : needed.rest))
				.join(separator)
		);
	});

	// `$opt(<sep>)` folds the optional trailing arguments of a call.
	//
	// An optional pin the developer has not touched is *not passed*, rather
	// than passed as its default or as `nil` — because plenty of Roblox
	// constructors reject an explicit `nil` where they accept a missing
	// argument, so the two are different calls and only one works.
	//
	// Trailing unset pins therefore disappear entirely. An unset pin with a
	// set one *after* it cannot disappear — the positions would shift and
	// argument four would arrive as argument three — so it is passed as
	// `nil`, which is the only honest thing left and is what a hand-written
	// call would do in the same spot.
	//
	//     TweenInfo.new(1, style, dir)                     nothing set
	//     TweenInfo.new(1, style, dir, 2)                   repeat set
	//     TweenInfo.new(1, style, dir, nil, nil, 0.5)       only delay set
	//
	// The leading separator comes from the group, as `$more` does, so a
	// call with no optional arguments does not end in a stray comma.
	template = template.replace(/\$opt\(([^)]*)\)/g, (_match, separator: string) => {
		const optional = r.inputs.filter((pin) => pin.optional === true);
		const args = callArguments(e, r, optional, (pin) => e.resolveInput(r, pin, scope));
		return args.length === 0 ? "" : separator + args.join(separator);
	});

	// `$pairs(<sep>)` folds `p0`, `p1`, … into `[key] = value`.
	//
	// Each row is one pair pin, in one of two states. Split, it is a Key and
	// a Value read from its parts. Whole, it takes a Key Value Pair, which
	// brings its own key — and is read here, where there is a table for the
	// entry to belong to, rather than as an expression it cannot be.
	//
	// `$args` cannot do this: variadic pins are all one type, and a
	// dictionary entry is two pins that mean different things. A node
	// wanting pairs derives them itself and folds them here, which keeps
	// "how many" in the node's own config exactly as `$args` does.
	//
	// A pair whose key is left empty is skipped rather than emitted as
	// `[""] = v`. Growing the node gives you a blank row, and a blank row
	// you have not filled in yet should not be a table entry.
	//
	// The fold carries its own surrounding spaces, so the template writes
	// `{$pairs(, )}` and an empty one comes out as `{}` rather than `{  }`.
	// That is a formatting decision living slightly further from the
	// template than it might, and the alternative is a stray double space in
	// generated code that a reader is meant to be able to read — and that
	// only stylua would tidy, which is optional.
	template = template.replace(/\$pairs\(([^)]*)\)/g, (_match, separator: string) => {
		const entries: string[] = [];
		// The rows as the node declares them, before splitting — a split row
		// is two part pins and would otherwise be counted twice or not at all.
		for (const pin of r.baseInputs) {
			const match = /^p(\d+)$/.exec(pin.id);
			if (!match) continue;

			let key: string;
			let entry: string;

			const split = e.splitOf(r, pin.id, "in");
			if (split) {
				// Read the parts directly rather than resolving the row.
				//
				// Resolving it would send a split input to `buildSplitInput`,
				// which rebuilds a value from `make` — and a pair is syntax
				// rather than a value, so there is nothing to rebuild it into.
				// Here there is a table for the entry to belong to, which is
				// the only place a key and a value mean anything together.
				const keyPin = r.inputs.find((p) => p.id === partPinId(pin.id, "key"));
				const valuePin = r.inputs.find((p) => p.id === partPinId(pin.id, "value"));
				if (!keyPin || !valuePin) continue;
				key = e.resolveInput(r, keyPin, scope);
				entry = e.resolveInput(r, valuePin, scope);
			} else {
				// Whole: the row takes a Key Value Pair, which brings its own
				// key. An empty row is left out rather than reported — growing
				// the node gives you one, and a row you have not filled in yet
				// should not be a table entry.
				const from = e.feederOf(r.node.id, pin.id);
				if (from?.def.id !== "table.pair") continue;
				key = e.resolveInput(from, e.pin(from, "key", "in"), scope);
				entry = e.resolveInput(from, e.pin(from, "value", "in"), scope);
			}

			if (key === '""' || key === "nil") continue;
			const plain = bracketsOnly(r) ? null : plainKey(key);
			entries.push(`${plain ?? `[${key}]`} = ${entry}`);
		}
		if (entries.length === 0) return "";
		// One key to a line, when the node asks for it.
		//
		// A trailing comma on the last entry, which is what Luau takes and
		// what stylua writes — it makes adding a key a one-line diff rather
		// than a two-line one. The leading tab is relative: `push` adds it to
		// whatever indentation the statement itself is at.
		if (r.node.config?.layout === "lines") {
			return `\n${entries.map((entry) => `\t${entry},`).join("\n")}\n`;
		}
		return ` ${entries.join(separator)} `;
	});

	// `$index(<table pin>, <key pin>)` — `t.name` or `t[expr]`.
	//
	// A placeholder rather than two templates on each node, because Get Index
	// and Set Index differ only in what surrounds the access and both have to
	// make the same decision about the key.
	template = template.replace(
		/\$index\(([A-Za-z_][A-Za-z0-9_]*),\s*([A-Za-z_][A-Za-z0-9_]*)\)/g,
		(_match, tablePin: string, keyPin: string) => {
			const table = e.resolveInput(r, e.pin(r, tablePin, "in"), scope);
			const key = e.resolveInput(r, e.pin(r, keyPin, "in"), scope);
			const plain = bracketsOnly(r) ? null : plainKey(key);
			const object = parenPrefix(table);
			return plain ? `${object}.${plain}` : `${object}[${key}]`;
		},
	);

	// Worked out before anything is spliced, so a value read twice is read
	// once and the local it binds sits above the line that uses it.
	const once = readOnce(e, r, template, scope);

	const re = /\$(in|out)\.([A-Za-z_][A-Za-z0-9_]*)(?:!(ident|raw))?/g;
	return template.replace(
		re,
		(match: string, side: string, pinId: string, modifier: string | undefined, offset: number) => {
			if (side === "out") {
				const bound = scope.lookup(`${r.node.id}/${pinId}`);
				if (bound) return bound;
				// Nothing bound it. `_` rather than a fresh unique name, because
				// a unique name here is *undeclared* — on the left of an
				// assignment that makes a global, which is the failure
				// `emitStatement` declares its referenced outputs to avoid.
				// This is the last line of defence for a spec that reaches here
				// some other way, and it should discard rather than leak.
				return "_";
			}
			const pin = e.pin(r, pinId, "in");

			// Read twice by this template: the same text both times, and a local
			// above it where the value could not be repeated safely.
			const shared = modifier === undefined ? once.get(pinId) : undefined;
			if (shared !== undefined) {
				return spliceIntoTemplate(shared, template, offset, offset + match.length);
			}

			if (modifier) {
				const link = e.index.sourceOf(r.node.id, pinId);
				if (link) {
					e.error(
						`"${pin.name || pinId}" on "${r.def.title}" must be typed in directly; ` +
							"it becomes part of the generated code, not a runtime value.",
						r.node.id,
						pinId,
					);
					return modifier === "ident" ? "_invalid" : "";
				}
				const lit: Literal | undefined = r.node.literals?.[pinId] ?? pin.default;
				const text = lit === undefined || lit.t === "nil" ? "" : String(lit.v);
				return modifier === "ident" ? toIdentifier(text, "field") : text;
			}

			const expr = e.resolveInput(r, pin, scope);
			// Only guard precedence where the template actually places the value
			// next to an operator, and only as far as that position needs.
			// Wrapping every argument would be correct but would make print((x))
			// of everything.
			return spliceIntoTemplate(expr, template, offset, offset + match.length);
		},
	);
}

/**
 * An expression a template may splice twice: a name, a number, a string, or
 * one of Luau's three keyword values. Anything with a call, an operator or a
 * constructor in it is worked out once and bound. See `readOnce`.
 */
const REPEATABLE = /^(?:[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|nil|true|false)$/;

/** A double-quoted literal with nothing in it that interpolation would mind. */
const PLAIN_STRING = /^"([^"`{}\\\n]*)"$/;

/**
 * Text inside an interpolated string.
 *
 * Luau reads a backtick as the end of one and a brace as the start of a hole,
 * so both are escaped; a backslash escapes itself, and a line break is written
 * as an escape rather than folded into the source.
 */
function escapeInterpolated(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\{/g, "\\{")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r");
}

/** Whether this Concatenate writes an interpolated string rather than a join. */
export function isInterpolated(config: NodeConfig | undefined): boolean {
	return config?.interpolate === true;
}
