/**
 * The canvas ZIndex map, its grid and its zoom range, which live in
 * `core/canvasLayers.ts` so the documentation can generate the specification's
 * tables from them. Re-exported here because everything drawing on the canvas
 * already imports from this file.
 */
export { GRID, LAYER, type LayerName, ZOOM } from "../core/canvasLayers.js";

/**
 * Node metrics, which moved to core when the compiler needed them too.
 * Re-exported here because everything drawing a node already imports from this
 * file, and a move should not be a hundred-line diff of import lines.
 */
export { NODE } from "../core/nodeMetrics.js";
