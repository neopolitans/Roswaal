# Notices

Roswaal itself is licensed 0BSD; see [LICENSE](LICENSE). Two things bundled
with it come from elsewhere and keep their own terms.

## Material Symbols

The icons in `src/app/icons.tsx` are **Material Symbols** by Google, inlined as
SVG path data. They reached Roswaal by way of the icon set used in beako, a
sibling tool in the same workflow.

Material Symbols is licensed under the **Apache License, Version 2.0**:

> Copyright Google LLC
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not
> use these files except in compliance with the License. You may obtain a copy
> of the License at
>
>     http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
> WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
> License for the specific language governing permissions and limitations under
> the License.

Source: <https://fonts.google.com/icons>

## CodeMirror

The pop-out Luau editor is built on **CodeMirror 6**, which is MIT licensed.
It is a runtime dependency rather than vendored source; see `package.json` and
the licence text in `node_modules/@codemirror/*/LICENSE`.

---

Everything else in this repository is Roswaal's own and is 0BSD: use it, modify
it, ship it, train on it, no attribution required.
