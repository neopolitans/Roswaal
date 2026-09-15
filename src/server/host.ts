/**
 * What the project layer runs on, bound to Node.
 *
 * **This is the swap point.** `project.ts` and `manifest.ts` import their
 * filesystem, their path arithmetic and their formatter from here and from
 * nowhere else, so pointing this one module somewhere else moves the whole
 * project layer somewhere else. The web build does exactly that — see
 * `src/web/host.ts`, and the `roswaalWebHost` plugin in `vite.config.ts` that
 * substitutes it.
 *
 * It is three re-exports rather than anything cleverer on purpose. There is no
 * registry to initialise, no `install()` for an entry point to forget, and no
 * mutable binding that could be read before it is set: which host a bundle got
 * is decided when the bundle is built, and a module graph that reaches
 * `node:fs` is a module graph that was built for Node.
 */

import nodeFs from "node:fs/promises";
import nodePath from "node:path";

import type { Formatter, ProjectFs, ProjectPath } from "./filesystem.js";
import { formatLuau as styluaFormatter } from "./format.js";

/**
 * Typed as the interface rather than inferred, so the check runs both ways:
 * Node's own `fs` has to satisfy what the project layer asks for, and the
 * project layer cannot quietly start using something the memory volume has
 * never heard of.
 */
export const fs: ProjectFs = nodeFs;

export const path: ProjectPath = nodePath;

export const formatLuau: Formatter = styluaFormatter;
