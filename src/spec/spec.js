// The technical specification's one script, for spec.roswaal.app.
//
// Search over the specification alone, fetched the first time the box is
// used rather than with every page, and the Copy button on code samples. The
// pages read and work without it.

(() => {
	const root = document.documentElement.dataset.root || "./";
	const box = document.getElementById("spec-search");
	const results = document.getElementById("spec-results");
	let index = null;
	let loading = null;
	let active = -1;

	const load = () => {
		loading ??= fetch(`${root}search.json`)
			.then((response) => response.json())
			.then((entries) => {
				index = entries;
			})
			.catch(() => {
				index = [];
			});
		return loading;
	};

	// Title first, then a section's heading, then the summary and the text.
	const rank = (query) => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		const hits = [];
		for (const entry of index ?? []) {
			const has = (text) => words.every((w) => text.toLowerCase().includes(w));
			if (has(entry.title)) hits.push({ score: 3, entry, href: entry.path });
			for (const heading of entry.headings) {
				if (has(heading.text)) {
					hits.push({ score: 2, entry, heading, href: `${entry.path}#${heading.id}` });
				}
			}
			if (!has(entry.title) && (has(entry.summary) || has(entry.text))) {
				hits.push({ score: 1, entry, href: entry.path });
			}
		}
		return hits.sort((a, b) => b.score - a.score).slice(0, 12);
	};

	const show = () => {
		const query = box.value.trim();
		results.replaceChildren();
		active = -1;
		if (query === "") {
			results.hidden = true;
			return;
		}
		const hits = rank(query);
		if (hits.length === 0) {
			const none = document.createElement("p");
			none.className = "none";
			none.textContent = "Nothing in the specification matches.";
			results.append(none);
		}
		for (const hit of hits) {
			const link = document.createElement("a");
			link.href = `${root}${hit.href}`;
			link.textContent = hit.heading ? hit.heading.text : hit.entry.title;
			const where = document.createElement("span");
			where.className = "where";
			where.textContent = hit.heading ? hit.entry.title : hit.entry.part;
			link.append(where);
			results.append(link);
		}
		results.hidden = false;
	};

	if (box && results) {
		box.addEventListener("focus", load);
		box.addEventListener("input", () => load().then(show));
		box.addEventListener("keydown", (event) => {
			const links = [...results.querySelectorAll("a")];
			if (event.key === "Escape") {
				box.value = "";
				show();
				return;
			}
			if (links.length === 0) return;
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				active = (active + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
				links.forEach((link, i) => link.classList.toggle("active", i === active));
			} else if (event.key === "Enter") {
				event.preventDefault();
				(links[active] ?? links[0]).click();
			}
		});
		document.addEventListener("click", (event) => {
			if (!event.target.closest(".spec-search")) results.hidden = true;
		});
	}

	// The chapters fold away on a phone, where they would push the text down a
	// screen; open on anything wider. Open without this script, so nothing is
	// ever out of reach.
	const fold = document.querySelector(".spec-nav-fold");
	if (fold && window.matchMedia("(max-width: 860px)").matches) fold.open = false;

	for (const button of document.querySelectorAll("[data-copy]")) {
		button.addEventListener("click", () => {
			const code = button.closest(".docs-code")?.querySelector("pre")?.textContent ?? "";
			navigator.clipboard?.writeText(code).then(() => {
				button.textContent = "Copied";
				setTimeout(() => {
					button.textContent = "Copy";
				}, 1500);
			});
		});
	}
})();
