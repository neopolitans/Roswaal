/**
 * The published site's own chrome: its settings popover and its search palette.
 *
 * Plain ES5-ish JavaScript with no imports, because there is nothing here to
 * share with the app -- the *data* is shared (the theme list, the preference
 * keys, the search index and its ranking all arrive from elsewhere on the
 * page) and only the few dozen lines of DOM are local. Bundled into `docs.js`
 * after `docsSearch.ts`, which publishes `window.__roswaalSearch`.
 *
 * Neither surface is needed to read a page. The gear is an addition to a header
 * that works without it, and the palette is a second way to reach the search
 * field that is already in the sidebar.
 */

(function () {
	var published = window.__roswaal;
	var search = window.__roswaalSearch;
	if (!published) return;
	// Bound after the check, so the functions below see it as present.
	const api = published;

	var up = (document.documentElement.dataset.slug || "").split("/").length - 1;
	var prefix = new Array(up + 1).join("../");

	/**
	 * An overlay, dismissed by Escape or a click outside it.
	 *
	 * Both surfaces here are the same shape, and the editor's stylesheet already
	 * describes both -- so these carry the app's own class names and the site
	 * borrows the appearance rather than describing it a second time.
	 */
	function overlay(className, build) {
		if (document.querySelector("." + className)) return;
		var back = document.createElement("div");
		back.className = className;
		/**
		 * Everything behind the overlay is inert while it is open.
		 *
		 * The arrows above an iPad's keyboard move focus to the previous and next
		 * field on the page -- and the page had fields behind this one, the
		 * sidebar's search among them. One tap sent the cursor under the overlay,
		 * with the keyboard still up and nothing the reader could see to type in.
		 * Inert, there is nowhere else to go, and the arrows grey out.
		 */
		// Cast: a page body's children are HTML elements, which `children` does
		// not promise because it is typed for any document, SVG included.
		var behind = /** @type {HTMLElement[]} */ (Array.from(document.body.children)).filter(
			function (el) {
				return !el.inert;
			},
		);
		behind.forEach(function (el) {
			el.inert = true;
		});
		function shut() {
			back.remove();
			behind.forEach(function (el) {
				el.inert = false;
			});
			document.removeEventListener("keydown", onKey);
		}
		function onKey(e) {
			if (e.key !== "Escape") return;
			e.preventDefault();
			shut();
		}
		back.addEventListener("pointerdown", function (e) {
			if (e.target === back) shut();
		});
		document.addEventListener("keydown", onKey);
		back.appendChild(build(shut));
		document.body.appendChild(back);
		// Focused now, inside the tap or keypress that opened it, rather than a
		// tick later: iOS only raises the keyboard for a focus made during the
		// gesture, and a search box you then have to tap again is a second step.
		var field = back.querySelector("input");
		if (field) field.focus();
	}

	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function head(title, sub, shut) {
		var bar = el("div", "docs-head");
		bar.appendChild(el("strong", null, title));
		bar.appendChild(el("span", "sub", sub));
		bar.appendChild(el("span", "spacer"));
		var close = el("button", "tb", "×");
		close.type = "button";
		close.title = "Close (Esc)";
		close.addEventListener("click", shut);
		bar.appendChild(close);
		return bar;
	}

	// -------------------------------------------------------------------------
	// Settings
	// -------------------------------------------------------------------------

	/** One preference: its name, what it does, and the choices, as the app draws them. */
	function setting(label, help, choices, current, pick) {
		var row = el("div", "setting");
		var left = el("div", "setting-label");
		left.appendChild(el("strong", null, label));
		left.appendChild(el("span", null, help));
		row.appendChild(left);

		var control = el("div", "setting-control");
		// A segmented control for a few short choices, a select for a long list.
		// The editor's Themes tab draws eight cards with a picture each; there is
		// no room for that here and eight slivers in one strip is not the answer.
		if (choices.length > 4) {
			var select = el("select", "tb");
			choices.forEach(function (choice, i) {
				var option = el("option", null, choice.label);
				option.value = String(i);
				if (choice.value === current) option.selected = true;
				select.appendChild(option);
			});
			select.addEventListener("change", function () {
				pick(choices[Number(select.value)].value);
			});
			control.appendChild(select);
		} else {
			var group = el("div", "segmented");
			choices.forEach(function (choice) {
				var button = el("button", choice.value === current ? "on" : "", choice.label);
				button.type = "button";
				if (choice.what) button.title = choice.what;
				button.addEventListener("click", function () {
					pick(choice.value);
					var all = group.querySelectorAll("button");
					for (var i = 0; i < all.length; i += 1) all[i].classList.remove("on");
					button.classList.add("on");
				});
				group.appendChild(button);
			});
			control.appendChild(group);
		}
		row.appendChild(control);
		return row;
	}

	function settingsPanel(shut) {
		var prefs = api.read();
		var panel = el("div", "docs settings docs-compact");
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-label", "Settings");
		panel.addEventListener("pointerdown", function (e) {
			e.stopPropagation();
		});
		panel.appendChild(head("Settings", "Preferences for this browser", shut));

		var page = el("div", "settings-page");

		// Read again on every change rather than patched from the copy this panel
		// opened with: the editor may be open in another tab and may have written
		// since, and the whole point of this is that both windows agree.
		function set(key, value) {
			var next = api.read();
			next[key] = value;
			api.write(next);
			api.paint();
		}

		page.appendChild(
			setting(
				"Theme",
				"The same preference the editor writes, so a scheme picked there is what these pages are in.",
				// Typed, so the System row's `null` and a scheme's name share one list.
				/** @type {{ value: string | null; label: string; what: string }[]} */
				([
					{ value: null, label: "System", what: "Light or dark, whichever your OS is set to." },
				]).concat(
					api.themes.map(function (t) {
						return { value: t.name, label: t.name, what: t.credit || "" };
					}),
				),
				prefs.theme,
				function (value) {
					set("theme", value);
				},
			),
		);

		page.appendChild(
			setting(
				"Font",
				"The face these pages are set in.",
				api.fonts.map(function (f) {
					return { value: f.font, label: f.label, what: f.what };
				}),
				prefs.docsFont,
				function (value) {
					set("docsFont", value);
				},
			),
		);

		var note = el("p", "settings-note");
		note.textContent =
			"These are this browser's, and nobody else's. The rest of the preferences — and the " +
			"project's own settings — are in the editor, which can reach the project.";
		page.appendChild(note);

		// Straight into the panel: `.docs-body` is a two-column grid for a nav that
		// is not here, and a lone child of it lands in the 232px nav column.
		panel.appendChild(page);
		return panel;
	}

	var gear = document.getElementById("prefs");
	if (gear) {
		gear.addEventListener("click", function () {
			overlay("docs-backdrop", settingsPanel);
		});
	}

	// -------------------------------------------------------------------------
	// The search palette
	// -------------------------------------------------------------------------

	/**
	 * `Ctrl` + `K` opens the palette here too.
	 *
	 * Not the sidebar's field, though a one-column site has somewhere obvious
	 * to land: the editor and Node Design open a palette, so a reader who
	 * learns the shortcut in one window learns it for all of them, and a
	 * shortcut that does something else on the site is a shortcut they have to
	 * remember twice. The field is still there and still
	 * filters the tree.
	 */
	function palette(shut) {
		var panel = el("div", "docs-palette");
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-label", "Search the docs");
		panel.addEventListener("pointerdown", function (e) {
			e.stopPropagation();
		});

		var field = el("div", "docs-palette-field");
		var input = el("input");
		input.type = "text";
		input.placeholder = "Search the docs";
		input.setAttribute("aria-label", "Search the docs");
		field.appendChild(input);
		var close = el("button", "tb icon-only", "×");
		close.type = "button";
		close.title = "Close (Esc)";
		close.addEventListener("click", shut);
		field.appendChild(close);
		panel.appendChild(field);

		var list = el("div", "docs-palette-list");
		panel.appendChild(list);
		var foot = el("div", "docs-palette-foot");
		[
			["↑↓", "to move"],
			["Enter", "to open"],
			["Esc", "to close"],
		].forEach(function (pair) {
			var span = el("span");
			span.appendChild(el("kbd", null, pair[0]));
			span.appendChild(document.createTextNode(" " + pair[1]));
			foot.appendChild(span);
		});
		panel.appendChild(foot);

		var hits = [];
		var at = 0;

		function href(entry) {
			return prefix + entry.slug + ".html";
		}

		function draw() {
			list.innerHTML = "";
			if (hits.length === 0) {
				list.appendChild(
					el(
						"div",
						"empty",
						input.value.trim() ? "Nothing matches." : "Type to search the documentation.",
					),
				);
				return;
			}
			hits.forEach(function (entry, i) {
				var hit = el("a", "docs-palette-hit" + (i === at ? " on" : ""));
				hit.href = href(entry);
				// `kind-node`, not `node`: the same trap the app's copy carries a note
				// about, `.node` being the canvas node in a stylesheet this size.
				var kind = entry.nodeId ? "node" : "article";
				hit.appendChild(el("span", "kind kind-" + kind, kind === "node" ? "Node" : "Article"));
				var body = el("span", "body");
				body.appendChild(el("span", "title", entry.title));
				body.appendChild(el("span", "where", entry.section));
				body.appendChild(el("span", "summary", entry.summary || ""));
				hit.appendChild(body);
				hit.addEventListener("pointerenter", function () {
					at = i;
					var all = list.querySelectorAll(".docs-palette-hit");
					for (var j = 0; j < all.length; j += 1) all[j].classList.remove("on");
					hit.classList.add("on");
				});
				list.appendChild(hit);
			});
		}

		function run() {
			var q = input.value.trim();
			at = 0;
			if (!q || !search || !search.index) {
				hits = [];
				draw();
				return;
			}
			// The sidebar's ranking, not a second one: two searches on one page that
			// disagree about which page is the best answer is worse than either.
			hits = search.rank(q, 25);
			draw();
		}

		input.addEventListener("input", run);
		input.addEventListener("keydown", function (e) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				if (hits.length === 0) return;
				e.preventDefault();
				at = (at + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
				draw();
				var on = list.querySelector(".docs-palette-hit.on");
				if (on) on.scrollIntoView({ block: "nearest" });
			} else if (e.key === "Enter" && hits[at]) {
				e.preventDefault();
				window.location.href = href(hits[at]);
			}
		});

		// The index may still be in flight on the first press, so type-ahead is not
		// lost: whatever is in the field is searched again the moment it lands.
		if (search && search.ready) search.ready.then(run);

		draw();
		setTimeout(function () {
			input.focus();
		}, 0);
		return panel;
	}

	document.addEventListener("keydown", function (e) {
		if ((e.key !== "k" && e.key !== "K") || !(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		overlay("docs-palette-backdrop", palette);
	});

	/**
	 * The same palette, for a screen with no keyboard to press Ctrl+K on.
	 *
	 * Hidden in the markup and shown from here, because without this script the
	 * button would have nothing behind it. The stylesheet decides where it is
	 * offered -- beside Contents, wherever Contents is.
	 */
	/**
	 * The contents and the outline fold to their title bars, as the editor's
	 * Docs window folds them, and remember it under the same keys -- so a
	 * reader who folded them there finds them folded here.
	 */
	function foldable(card, key, open, shut) {
		if (!card) return;
		var button = card.querySelector(".docs-card-fold");
		function apply(folded) {
			card.classList.toggle("folded", folded);
			if (button) {
				button.setAttribute("aria-expanded", String(!folded));
				button.title = folded ? open : shut;
			}
		}
		var stored = false;
		try {
			stored = localStorage.getItem(key) === "1";
		} catch (e) {
			// Storage refused: the fold still works for this visit.
		}
		apply(stored);
		if (!button) return;
		button.addEventListener("click", function () {
			var folded = !card.classList.contains("folded");
			apply(folded);
			try {
				localStorage.setItem(key, folded ? "1" : "0");
			} catch (e) {
				// As above.
			}
		});
	}
	foldable(
		document.querySelector(".docs-nav"),
		"roswaal.docs.contentsFolded",
		"Show the contents",
		"Fold the contents away",
	);
	foldable(
		document.querySelector(".docs-toc-card"),
		"roswaal.docs.outlineFolded",
		"Show the outline",
		"Fold the outline away",
	);

	/** The section being read: lit in the outline, and named on its title bar. */
	var outline = document.querySelector(".docs-toc-card");
	var reading = document.querySelector(".docs-content");
	if (outline && reading) {
		var scroller = reading;
		var links = Array.prototype.slice.call(outline.querySelectorAll(".docs-toc-link"));
		var here = outline.querySelector(".docs-card-where .here");
		var spy = function () {
			var top = scroller.getBoundingClientRect().top + 90;
			var at = 0;
			links.forEach(function (link, i) {
				var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
				var heading = document.getElementById(id);
				if (heading && heading.getBoundingClientRect().top <= top) at = i;
			});
			links.forEach(function (link, i) {
				link.classList.toggle("on", i === at);
			});
			if (here && links[at]) here.textContent = links[at].textContent;
		};
		spy();
		scroller.addEventListener("scroll", spy, { passive: true });
	}

	var finder = document.getElementById("docs-search");
	if (finder) {
		finder.hidden = false;
		finder.addEventListener("click", function () {
			var contents = document.getElementById("docs-nav-open");
			if (contents instanceof HTMLInputElement) contents.checked = false;
			overlay("docs-palette-backdrop", palette);
		});
	}
})();
