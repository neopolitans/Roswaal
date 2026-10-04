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
	type CompileOutcome,
	type CompileStep,
	checkMapPaths,
	compileAll,
	compileMap,
	compileScript,
	describeOutcome,
	type MapOutcome,
	outputCollision,
	splitGenerated,
	stampOutputHash,
	supersededOutputs,
} from "./compile.js";
export {
	type InitOptions,
	type InitOutcome,
	initProject,
	isInitialised,
	type OpenProject,
	openProject,
	parseConfig,
	readConfig,
	writeConfig,
} from "./config.js";
export {
	collectMaps,
	findRojoProjects,
	graphName,
	graphNameFor,
	importRojoProject,
	type RojoImportOutcome,
	type RojoProjectFile,
	readMap,
	readScript,
	readText,
	writeMap,
	writeScript,
} from "./documents.js";
export { createFolder, deleteEntry, moveEntry, renameEntry } from "./entries.js";
export { formatLuau } from "./host.js";
export { type ExportedType, exportedTypes, locateFile } from "./locate.js";
export { readLuaurcFiles, writeLuaurcFile } from "./luaurc.js";
export { unsyncedGraphs } from "./mapFolders.js";
export { findOrphanOutputs, graphOutputPath, removeOutputs } from "./outputs.js";
export {
	copyPackBetween,
	createPack,
	deletePack,
	deletePackNode,
	duplicatePack,
	listPacks,
	type PackContents,
	type PackFile,
	packUsage,
	readPack,
	savePackNode,
	scanProjectPacks,
	setPackRequires,
} from "./packs.js";
export { entryPath, safeJoin } from "./paths.js";
export {
	exportPlace,
	findPlaceFile,
	type PlaceExport,
	placeEntries,
	placeReport,
	readPlaceBytes,
	writePlaceImport,
} from "./place.js";
export { buildTree, type FolderRole, resolveWallyPackage, type TreeEntry } from "./tree.js";
