/**
 * Project I/O: reading and writing a Roswaal project on disk.
 *
 * A project is any directory containing a `roswaal.json`. Graphs live under
 * `sourceDir`, compiled Luau is written to `outDir`, and Rojo picks it up from
 * there — Roswaal never talks to Studio itself.
 *
 * This module is the door, not the room: every name here is defined in one of
 * the modules beside it and re-exported, by name, so the routes, the CLI, the
 * web worker and the tests import from one place without knowing how the work
 * is divided. A new export goes in its own module first and is listed here.
 */

export { collectBinaries, collectProject } from "./collect.js";
export {
	checkMapPaths,
	compileAll,
	compileMap,
	compileScript,
	describeOutcome,
	outputCollision,
	splitGenerated,
	stampOutputHash,
	supersededOutputs,
	type CompileOutcome,
	type CompileStep,
	type MapOutcome,
} from "./compile.js";
export {
	initProject,
	isInitialised,
	openProject,
	parseConfig,
	readConfig,
	writeConfig,
	type InitOptions,
	type InitOutcome,
	type OpenProject,
} from "./config.js";
export {
	collectMaps,
	findRojoProjects,
	graphName,
	graphNameFor,
	importRojoProject,
	readMap,
	readScript,
	readText,
	writeMap,
	writeScript,
	type RojoImportOutcome,
	type RojoProjectFile,
} from "./documents.js";
export { createFolder, deleteEntry, moveEntry, renameEntry } from "./entries.js";
export { formatLuau } from "./host.js";
export { exportedTypes, locateFile, type ExportedType } from "./locate.js";
export { readLuaurcFiles, writeLuaurcFile } from "./luaurc.js";
export { findOrphanOutputs, graphOutputPath, removeOutputs } from "./outputs.js";
export {
	copyPackBetween,
	createPack,
	deletePack,
	deletePackNode,
	duplicatePack,
	listPacks,
	packUsage,
	readPack,
	savePackNode,
	scanProjectPacks,
	setPackRequires,
	type PackContents,
	type PackFile,
} from "./packs.js";
export { entryPath, safeJoin } from "./paths.js";
export {
	exportPlace,
	findPlaceFile,
	placeEntries,
	placeReport,
	readPlaceBytes,
	writePlaceImport,
	type PlaceExport,
} from "./place.js";
export { buildTree, resolveWallyPackage, type FolderRole, type TreeEntry } from "./tree.js";
