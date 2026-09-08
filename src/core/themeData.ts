/**
 * The built-in colour schemes. GENERATED — do not edit.
 *
 * Source: `themes/*.json`, and the vendored licences under `notices/` that
 * the borrowed ones name. Regenerate with `npm run build:themes`, which is
 * also what `npm run build` does. `tests/theme.test.ts` fails when this file
 * has drifted from either.
 *
 * Committed deliberately, so a fresh clone builds without knowing the
 * generator exists.
 */

import type { Theme } from "./theme.js";

export const BUILTIN_THEMES: Theme[] = [
	{
		"name": "Roswaal Light",
		"builtin": true,
		"order": 0,
		"dark": false,
		"credit": "neopolitans",
		"source": "https://github.com/neopolitans/Roswaal",
		"colors": {
			"app": "#eceef2",
			"panel": "#f6f7f9",
			"canvas": "#d9dce3",
			"input": "#ffffff",
			"text": "#1c1f24",
			"subText": "#5c636e",
			"dimText": "#8b93a0",
			"border": "#c6cad2",
			"borderStrong": "#a8aeb9",
			"nodeBody": "#fbfbfd",
			"nodeBorder": "#b3b9c4",
			"wireExec": "#5a616d",
			"accent": "#3b6ea5",
			"danger": "#c0392b",
			"warning": "#b8860b",
			"ok": "#2e7d47",
			"select": "#ff9c2e",
			"pure": "#6aa84f",
			"capsule": "#e9ebf0",
			"capsuleBorder": "#b3b9c4"
		},
		"code": {
			"keyword": "#9a4f9a",
			"string": "#2f7f4f",
			"number": "#8a5a2f",
			"comment": "#7a8290",
			"operator": "#4a6fa5",
			"property": "#2c6f8f",
			"global": "#2c6f8f",
			"function": "#7a5a2f"
		}
	},
	{
		"name": "Roswaal Dark",
		"builtin": true,
		"order": 1,
		"dark": true,
		"credit": "neopolitans",
		"source": "https://github.com/neopolitans/Roswaal",
		"colors": {
			"app": "#16181d",
			"panel": "#1b1e24",
			"canvas": "#101216",
			"input": "#23272f",
			"text": "#e4e7ec",
			"subText": "#9aa2af",
			"dimText": "#6b7280",
			"border": "#2d323b",
			"borderStrong": "#414855",
			"nodeBody": "#262a32",
			"nodeBorder": "#3a404b",
			"wireExec": "#b9c0cc",
			"accent": "#5b9bd5",
			"danger": "#e06c5a",
			"warning": "#d8a83a",
			"ok": "#5cb87a",
			"select": "#ff9c2e",
			"pure": "#7fbf5f",
			"capsule": "#2b3038",
			"capsuleBorder": "#3d434e"
		},
		"code": {
			"keyword": "#c98fd0",
			"string": "#8fce9b",
			"number": "#d9a86c",
			"comment": "#6b7280",
			"operator": "#86b3e0",
			"property": "#7fc4d6",
			"global": "#7fc4d6",
			"function": "#d9b06c"
		}
	},
	{
		"name": "Tokyo Night",
		"builtin": true,
		"order": 2,
		"dark": true,
		"credit": "Enkia — MIT",
		"source": "https://github.com/tokyo-night/tokyo-night-vscode-theme",
		"licence": {
			"spdx": "MIT",
			"holder": "Copyright (c) 2018-present Enkia",
			"textFile": "upstream/tokyo-night.txt"
		},
		"colors": {
			"app": "#1a1b26",
			"panel": "#16161e",
			"canvas": "#101019",
			"input": "#1f2335",
			"text": "#c0caf5",
			"subText": "#a9b1d6",
			"dimText": "#565f89",
			"border": "#292e42",
			"borderStrong": "#3b4261",
			"nodeBody": "#24283b",
			"nodeBorder": "#3b4261",
			"wireExec": "#a9b1d6",
			"accent": "#7aa2f7",
			"danger": "#f7768e",
			"warning": "#e0af68",
			"ok": "#9ece6a",
			"select": "#ff9e64",
			"pure": "#9ece6a",
			"capsule": "#292e42",
			"capsuleBorder": "#3b4261"
		},
		"code": {
			"keyword": "#bb9af7",
			"string": "#9ece6a",
			"number": "#ff9e64",
			"comment": "#565f89",
			"operator": "#89ddff",
			"property": "#7dcfff",
			"global": "#2ac3de",
			"function": "#7aa2f7"
		}
	},
	{
		"name": "Tokyo Night Storm",
		"builtin": true,
		"order": 3,
		"dark": true,
		"credit": "Enkia — MIT",
		"source": "https://github.com/tokyo-night/tokyo-night-vscode-theme",
		"licence": {
			"spdx": "MIT",
			"holder": "Copyright (c) 2018-present Enkia",
			"textFile": "upstream/tokyo-night.txt"
		},
		"colors": {
			"app": "#24283b",
			"panel": "#1f2335",
			"canvas": "#1a1b26",
			"input": "#292e42",
			"text": "#c0caf5",
			"subText": "#a9b1d6",
			"dimText": "#565f89",
			"border": "#292e42",
			"borderStrong": "#3b4261",
			"nodeBody": "#2f344d",
			"nodeBorder": "#3b4261",
			"wireExec": "#a9b1d6",
			"accent": "#7aa2f7",
			"danger": "#f7768e",
			"warning": "#e0af68",
			"ok": "#9ece6a",
			"select": "#ff9e64",
			"pure": "#9ece6a",
			"capsule": "#292e42",
			"capsuleBorder": "#3b4261"
		},
		"code": {
			"keyword": "#bb9af7",
			"string": "#9ece6a",
			"number": "#ff9e64",
			"comment": "#565f89",
			"operator": "#89ddff",
			"property": "#7dcfff",
			"global": "#2ac3de",
			"function": "#7aa2f7"
		}
	},
	{
		"name": "Catppuccin Mocha",
		"builtin": true,
		"order": 4,
		"dark": true,
		"credit": "Catppuccin — MIT",
		"source": "https://github.com/catppuccin/catppuccin",
		"licence": {
			"spdx": "MIT",
			"holder": "Copyright (c) 2021 Catppuccin",
			"textFile": "upstream/catppuccin.txt"
		},
		"colors": {
			"app": "#1e1e2e",
			"panel": "#181825",
			"canvas": "#11111b",
			"input": "#313244",
			"text": "#cdd6f4",
			"subText": "#bac2de",
			"dimText": "#6c7086",
			"border": "#313244",
			"borderStrong": "#45475a",
			"nodeBody": "#313244",
			"nodeBorder": "#585b70",
			"wireExec": "#bac2de",
			"accent": "#89b4fa",
			"danger": "#f38ba8",
			"warning": "#f9e2af",
			"ok": "#a6e3a1",
			"select": "#fab387",
			"pure": "#a6e3a1",
			"capsule": "#45475a",
			"capsuleBorder": "#585b70"
		},
		"code": {
			"keyword": "#cba6f7",
			"string": "#a6e3a1",
			"number": "#fab387",
			"comment": "#6c7086",
			"operator": "#89dceb",
			"property": "#b4befe",
			"global": "#94e2d5",
			"function": "#89b4fa"
		}
	},
	{
		"name": "Nord",
		"builtin": true,
		"order": 5,
		"dark": true,
		"credit": "Sven Greb — MIT",
		"source": "https://github.com/nordtheme/nord",
		"licence": {
			"spdx": "MIT",
			"holder": "Copyright (c) 2016-present Sven Greb <development@svengreb.de> (https://www.svengreb.de)",
			"textFile": "upstream/nord.txt"
		},
		"colors": {
			"app": "#2e3440",
			"panel": "#272c36",
			"canvas": "#21262f",
			"input": "#2e3440",
			"text": "#eceff4",
			"subText": "#d8dee9",
			"dimText": "#7b8494",
			"border": "#3b4252",
			"borderStrong": "#4c566a",
			"nodeBody": "#3b4252",
			"nodeBorder": "#4c566a",
			"wireExec": "#d8dee9",
			"accent": "#88c0d0",
			"danger": "#bf616a",
			"warning": "#ebcb8b",
			"ok": "#a3be8c",
			"select": "#d08770",
			"pure": "#a3be8c",
			"capsule": "#3b4252",
			"capsuleBorder": "#4c566a"
		},
		"code": {
			"keyword": "#81a1c1",
			"string": "#a3be8c",
			"number": "#b48ead",
			"comment": "#616e88",
			"operator": "#81a1c1",
			"property": "#d8dee9",
			"global": "#8fbcbb",
			"function": "#88c0d0"
		}
	},
	{
		"name": "Aquatic",
		"builtin": true,
		"order": 6,
		"dark": true,
		"credit": "neopolitans",
		"source": "https://github.com/neopolitans/Beako",
		"colors": {
			"app": "#161523",
			"panel": "#0a181e",
			"canvas": "#0a0f16",
			"input": "#141c29",
			"text": "#c0caf5",
			"subText": "#6e7596",
			"dimText": "#42808f",
			"border": "#143a4a",
			"borderStrong": "#19688a",
			"nodeBody": "#1a2436",
			"nodeBorder": "#19688a",
			"wireExec": "#a9b1d6",
			"accent": "#607ebe",
			"danger": "#f7768e",
			"warning": "#e0af68",
			"ok": "#9ece6a",
			"select": "#ff9e64",
			"pure": "#9ece6a",
			"capsule": "#141c29",
			"capsuleBorder": "#19688a"
		},
		"code": {
			"keyword": "#bb9af7",
			"string": "#9ece6a",
			"number": "#ff9e64",
			"comment": "#565f89",
			"operator": "#7dcfff",
			"property": "#73daca",
			"global": "#2ac3de",
			"function": "#607ebe"
		}
	}
];

/**
 * Upstream licence texts, byte for byte, keyed by `licence.textFile`.
 *
 * Not written by hand and not rendered from a template: three MIT licences
 * in this repository are headed three different ways and one carries an
 * email address, so a template would produce something that is *nearly* each
 * author's licence. Nearly is the one thing an attribution may not be.
 */
export const LICENCE_TEXTS: Record<string, string> = {
	"upstream/catppuccin.txt": "MIT License\n\nCopyright (c) 2021 Catppuccin\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n",
	"upstream/nord.txt": "MIT License (MIT)\n\nCopyright (c) 2016-present Sven Greb <development@svengreb.de> (https://www.svengreb.de)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n",
	"upstream/tokyo-night.txt": "The MIT License (MIT)\n\nCopyright (c) 2018-present Enkia\n\nPermission is hereby granted, free of charge, to any person obtaining\na copy of this software and associated documentation files (the\n\"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to\npermit persons to whom the Software is furnished to do so, subject to\nthe following conditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND\nNONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE\nLIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION\nOF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION\nWITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n"
};
