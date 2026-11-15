/**
 * The meshes a place's MeshParts and FileMeshes name, from what Sign in with
 * Roblox has downloaded: asked of the daemon, which fetches what the project
 * lacks, then read back and read as meshes.
 *
 * Nothing is asked of anyone who is not signed in; their places keep the boxes
 * they have always had. A mesh that cannot be read stays a box.
 */

import { type FileMesh, readMesh } from "../../core/rbx/mesh.js";
import { api } from "../api.js";
import { bytesOf, ensure } from "./images.js";

/** Roblox's asset type for a mesh. */
const MESH_TYPE = 4;

/** Each of `assets` read as a mesh, handed to `show` as it arrives. */
export async function loadMeshes(
	assets: readonly string[],
	show: (asset: string, mesh: FileMesh) => void,
): Promise<void> {
	if (assets.length === 0) return;
	const status = await api.robloxStatus().catch(() => null);
	if (!status?.signedIn) return;
	const unique = [...new Set(assets)];
	const ready = await ensure(unique);
	for (const id of unique) {
		if (!ready.has(id)) continue;
		const got = await bytesOf(id);
		if (!got || (got.assetTypeId !== undefined && got.assetTypeId !== MESH_TYPE)) continue;
		try {
			show(id, readMesh(got.bytes));
		} catch {
			// Not a mesh Roswaal reads, as one compressed with Draco: it stays a box.
		}
	}
}
