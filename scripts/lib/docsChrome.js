/**
 * The published site's own chrome: its settings popover and its search palette.
 *
 * Plain ES5-ish JavaScript rather than a bundle, because there is nothing here
 * to share with the app -- the *data* is shared (the theme list, the
 * preference keys, the search index and its ranking all arrive from elsewhere
 * on the page) and only the few dozen lines of DOM are local. Appended to
 * `docs.js`, after the script that publishes `window.__roswaalSearch`.
 *
 * Neither surface is needed to read a page. The gear is an addition to a header
 * that works without it, and the palette is a second way to reach the search
 * field that is already in the sidebar.
 */

(function () {
  var api = window.__roswaal;
  var search = window.__roswaalSearch;
  if (!api) return;

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
    function shut() {
      back.remove();
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
    panel.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
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

    page.appendChild(setting(
      "Theme",
      "The same preference the editor writes, so a scheme picked there is what these pages are in.",
      [{ value: null, label: "System", what: "Light or dark, whichever your OS is set to." }].concat(
        api.themes.map(function (t) {
          return { value: t.name, label: t.name, what: t.credit || "" };
        }),
      ),
      prefs.theme,
      function (value) { set("theme", value); },
    ));

    page.appendChild(setting(
      "Font",
      "The face these pages are set in.",
      api.fonts.map(function (f) {
        return { value: f.font, label: f.label, what: f.what };
      }),
      prefs.docsFont,
      function (value) { set("docsFont", value); },
    ));

    var note = el("p", "settings-note");
    note.textContent =
      "These are this browser's, and nobody else's. The rest of the preferences — and the "
      + "project's own settings — are in the editor, which can reach the project.";
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
   * It used to put the cursor in the sidebar's field instead, on the argument
   * that a one-column site has somewhere obvious to land. The argument was
   * wrong about the thing that matters: the editor and Node Design open a
   * palette, so a reader who learns the shortcut in one window learns it for
   * all of them, and a shortcut that does something else on the site is a
   * shortcut they have to remember twice. The field is still there and still
   * filters the tree.
   */
  function palette(shut) {
    var panel = el("div", "docs-palette");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Search the docs");
    panel.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

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
    [["↑↓", "to move"], ["Enter", "to open"], ["Esc", "to close"]].forEach(function (pair) {
      var span = el("span");
      span.appendChild(el("kbd", null, pair[0]));
      span.appendChild(document.createTextNode(" " + pair[1]));
      foot.appendChild(span);
    });
    panel.appendChild(foot);

    var hits = [];
    var at = 0;

    function href(entry) { return prefix + entry.slug + ".html"; }

    function draw() {
      list.innerHTML = "";
      if (hits.length === 0) {
        list.appendChild(el(
          "div", "empty",
          input.value.trim() ? "Nothing matches." : "Type to search the documentation.",
        ));
        return;
      }
      hits.forEach(function (entry, i) {
        var hit = el("a", "docs-palette-hit" + (i === at ? " on" : ""));
        hit.href = href(entry);
        // `kind-node`, not `node`: the same trap the app's copy carries a note
        // about, `.node` being the canvas node in a stylesheet this size.
        var kind = entry.id ? "node" : "article";
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
      var q = input.value.trim().toLowerCase();
      at = 0;
      if (!q || !search || !search.index) { hits = []; draw(); return; }
      // The sidebar's ranking, not a second one: two searches on one page that
      // disagree about which page is the best answer is worse than either.
      hits = search.index
        .map(function (e) { return { e: e, s: search.score(e, q) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 25)
        .map(function (x) { return x.e; });
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
    setTimeout(function () { input.focus(); }, 0);
    return panel;
  }

  document.addEventListener("keydown", function (e) {
    if ((e.key !== "k" && e.key !== "K") || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    overlay("docs-palette-backdrop", palette);
  });
})();
