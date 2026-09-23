/**
 * The call being typed, shown above the cursor with the parameter it is on:
 * `Instance.new(className: string, parent: Instance?)` with `className` lit,
 * then `parent` after the comma. Above, so it sits clear of the completion
 * list that opens below.
 *
 * Which call and which parameter is worked out in core (`signatureAt`); this
 * only draws it, and redraws it as the cursor moves.
 */

import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { showTooltip, type Tooltip } from "@codemirror/view";

import { signatureAt, type Signature } from "../core/luau/signature.js";
import type { Target } from "../core/schema.js";

function span(text: string, cls: string): HTMLSpanElement {
	const el = document.createElement("span");
	el.className = cls;
	el.textContent = text;
	return el;
}

function render(signature: Signature): HTMLElement {
	const dom = document.createElement("div");
	dom.className = "luau-signature";
	const code = document.createElement("code");
	code.append(span(signature.label, "tok-function"), "(");
	signature.params.forEach((param, i) => {
		if (i > 0) code.append(", ");
		const one = document.createElement("span");
		one.className = i === signature.active ? "param active" : "param";
		one.append(param.name);
		if (param.type) one.append(": ", span(param.type, "tok-type"));
		code.append(one);
	});
	code.append(")");
	if (signature.returns) code.append(" → ", span(signature.returns, "tok-type"));
	dom.append(code);
	return dom;
}

export function luauSignature(getTarget: () => Target): Extension {
	const compute = (state: EditorState): Tooltip | null => {
		const pos = state.selection.main.head;
		const signature = signatureAt(state.doc.toString(), pos, getTarget() !== "lune");
		if (!signature) return null;
		return {
			pos,
			above: true,
			strictSide: true,
			arrow: false,
			create: () => ({ dom: render(signature) }),
		};
	};
	return StateField.define<Tooltip | null>({
		create: compute,
		update: (value, tr) => (tr.docChanged || tr.selection ? compute(tr.state) : value),
		provide: (field) => showTooltip.from(field),
	});
}
