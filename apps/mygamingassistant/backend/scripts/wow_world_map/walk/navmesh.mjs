// Builds Recast navmesh polygons for terrain tiles written by geometry.py.
//
//   node navmesh.mjs [--fine] <out-dir> <tile.bin> [<tile.bin> ...]
//
// Each input tile (533.33 yd, plus a margin of neighbouring geometry) is
// built as SUBTILES x SUBTILES Recast tiles of CELLS_PER_SUBTILE cells, so
// Recast tiles line up across terrain tiles and their border edges can be
// matched up afterwards (walk_graph.py). Output per input tile: the polygon
// meshes (vertices in cells, polygons with neighbour links, area per polygon).
//
// Uses recast-navigation (MIT, https://github.com/isaac-mason/recast-navigation-js).
import fs from 'node:fs';
import path from 'node:path';
import {
  init,
  RecastBuildContext,
  allocHeightfield,
  createHeightfield,
  rasterizeTriangles,
  filterLowHangingWalkableObstacles,
  filterLedgeSpans,
  filterWalkableLowHeightSpans,
  allocCompactHeightfield,
  buildCompactHeightfield,
  erodeWalkableArea,
  buildDistanceField,
  buildRegions,
  allocContourSet,
  buildContours,
  allocPolyMesh,
  buildPolyMesh,
  freeHeightfield,
  freeCompactHeightfield,
  freeContourSet,
  freePolyMesh,
  FloatArray,
  IntArray,
  UnsignedCharArray,
  Recast,
} from 'recast-navigation';

const args = process.argv.slice(2);
// --fine: a dungeon's smaller cells (~0.35 yd), so a tower's narrow spiral
// stair survives (0.26 yd starts splitting floors at thin trim, and a whole
// continent at either size is too big).
const FINE = args[0] === '--fine';
const TILE_SIZE = 1600 / 3;
const SUBTILES = FINE ? 6 : 4;
const CELLS_PER_SUBTILE = 256;
const CS = TILE_SIZE / SUBTILES / CELLS_PER_SUBTILE; // ~0.52 yd (~0.35 fine)
const CH = 0.25;
const AGENT_HEIGHT = 2.0; // yd
const AGENT_CLIMB = 1.0; // yd — stairs, kerbs, small ledges
const AGENT_RADIUS = 0.3; // yd — a player's own collision radius
const WALKABLE_HEIGHT = Math.ceil(AGENT_HEIGHT / CH);
const WALKABLE_CLIMB = Math.floor(AGENT_CLIMB / CH);
const WALKABLE_RADIUS = Math.max(1, Math.round(AGENT_RADIUS / CS)); // whole cells, at least one
const BORDER = WALKABLE_RADIUS + 3;
const MAX_EDGE_LEN = Math.round(12 / CS);
const MAX_SIMPLIFICATION_ERROR = 1.3;
// geometry.py area (1 ground, 2 water, 3 road) -> Recast area id.
const RECAST_AREA = { 1: 63, 2: 1, 3: 2 };
const MIN_REGION_AREA = 8 * 8;
const MERGE_REGION_AREA = 20 * 20;
const NVP = 6;
const MAP_ORIGIN = 32 * TILE_SIZE;

function readTile(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'MGAW') throw new Error(`${file}: bad magic`);
  const nv = buf.readUInt32LE(4);
  const nt = buf.readUInt32LE(8);
  let off = 28;
  const verts = new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + nv * 12));
  off += nv * 12;
  const tris = new Int32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + nt * 12));
  off += nt * 12;
  const areas = new Uint8Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + nt));
  return { verts, tris, areas };
}

// The tile's row / column from its file name: <row>_<col>.bin
function tileIndex(file) {
  const [row, col] = path.basename(file, '.bin').split('_').map(Number);
  return { row, col };
}

function buildSubtile(ctx, geo, bmin, bmax) {
  const pad = BORDER * CS;
  const emin = [bmin[0] - pad, bmin[1], bmin[2] - pad];
  const emax = [bmax[0] + pad, bmax[1], bmax[2] + pad];
  const { verts, tris, areas } = geo;
  // Triangles touching the expanded bounds (x / z only).
  const picked = [];
  for (let t = 0; t < areas.length; t++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k] * 3;
      x0 = Math.min(x0, verts[v]); x1 = Math.max(x1, verts[v]);
      z0 = Math.min(z0, verts[v + 2]); z1 = Math.max(z1, verts[v + 2]);
    }
    if (x1 >= emin[0] && x0 <= emax[0] && z1 >= emin[2] && z0 <= emax[2]) picked.push(t);
  }
  if (!picked.length) return null;
  const size = CELLS_PER_SUBTILE + BORDER * 2;
  const hf = allocHeightfield();
  if (!createHeightfield(ctx, hf, size, size, emin, emax, CS, CH)) throw new Error('heightfield');
  const triArr = new IntArray();
  triArr.copy(Int32Array.from(picked.flatMap((t) => [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]])));
  const areaArr = new UnsignedCharArray();
  // Recast walkable area ids: ground 63 (RC_WALKABLE_AREA), water 1, road 2; 0 = obstacle.
  // Regions never cross an area change, so polygons split along a road's edges.
  areaArr.copy(Uint8Array.from(picked.map((t) => RECAST_AREA[areas[t]] ?? 0)));
  const ok = rasterizeTriangles(ctx, geo.vertArr, verts.length / 3, triArr, areaArr, picked.length, hf, WALKABLE_CLIMB);
  triArr.destroy();
  areaArr.destroy();
  if (!ok) throw new Error('rasterize');
  filterLowHangingWalkableObstacles(ctx, WALKABLE_CLIMB, hf);
  filterLedgeSpans(ctx, WALKABLE_HEIGHT, WALKABLE_CLIMB, hf);
  filterWalkableLowHeightSpans(ctx, WALKABLE_HEIGHT, hf);
  const chf = allocCompactHeightfield();
  if (!buildCompactHeightfield(ctx, WALKABLE_HEIGHT, WALKABLE_CLIMB, hf, chf)) throw new Error('compact');
  freeHeightfield(hf);
  erodeWalkableArea(ctx, WALKABLE_RADIUS, chf);
  buildDistanceField(ctx, chf);
  if (!buildRegions(ctx, chf, BORDER, MIN_REGION_AREA, MERGE_REGION_AREA)) throw new Error('regions');
  const cset = allocContourSet();
  if (!buildContours(ctx, chf, MAX_SIMPLIFICATION_ERROR, MAX_EDGE_LEN, cset, Recast.RC_CONTOUR_TESS_WALL_EDGES)) {
    throw new Error('contours');
  }
  freeCompactHeightfield(chf);
  const pmesh = allocPolyMesh();
  if (!buildPolyMesh(ctx, cset, NVP, pmesh)) throw new Error('polymesh');
  freeContourSet(cset);
  const nverts = pmesh.nverts();
  const npolys = pmesh.npolys();
  const out = {
    bminY: pmesh.bmin().y,
    verts: new Uint16Array(nverts * 3),
    polys: new Uint16Array(npolys * NVP * 2),
    areas: new Uint8Array(npolys),
  };
  for (let i = 0; i < nverts * 3; i++) out.verts[i] = pmesh.verts(i);
  for (let i = 0; i < npolys * NVP * 2; i++) out.polys[i] = pmesh.polys(i);
  for (let i = 0; i < npolys; i++) out.areas[i] = pmesh.areas(i);
  freePolyMesh(pmesh);
  return npolys ? out : null;
}

function buildTile(file, outDir) {
  const { row, col } = tileIndex(file);
  const geo = readTile(file);
  geo.vertArr = new FloatArray();
  geo.vertArr.copy(geo.verts);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < geo.verts.length; i += 3) {
    minY = Math.min(minY, geo.verts[i]);
    maxY = Math.max(maxY, geo.verts[i]);
  }
  const ctx = new RecastBuildContext();
  const parts = [];
  // Recast x = -Y (east), z = -X (south). The tile's north-west corner:
  const x0 = -(MAP_ORIGIN - col * TILE_SIZE);
  const z0 = -(MAP_ORIGIN - row * TILE_SIZE);
  const sub = CELLS_PER_SUBTILE * CS;
  for (let sz = 0; sz < SUBTILES; sz++) {
    for (let sx = 0; sx < SUBTILES; sx++) {
      const bmin = [x0 + sx * sub, minY - 1, z0 + sz * sub];
      const bmax = [x0 + (sx + 1) * sub, maxY + 1, z0 + (sz + 1) * sub];
      if (!geo.areas.length) continue;
      const mesh = buildSubtile(ctx, geo, bmin, bmax);
      if (mesh) parts.push({ sx, sz, bmin, mesh });
    }
  }
  geo.vertArr.destroy();
  // Output: MGAN, row, col, cs, ch, nvp, nparts, then per part:
  //   sx, sz (u16), bmin x/y/z (f32), nverts, npolys (u32), verts, polys, areas
  const chunks = [];
  const head = Buffer.alloc(4 + 4 * 2 + 4 * 2 + 4 * 2);
  head.write('MGAN', 0, 'latin1');
  head.writeInt32LE(row, 4);
  head.writeInt32LE(col, 8);
  head.writeFloatLE(CS, 12);
  head.writeFloatLE(CH, 16);
  head.writeUInt32LE(NVP, 20);
  head.writeUInt32LE(parts.length, 24);
  chunks.push(head);
  for (const { sx, sz, bmin, mesh } of parts) {
    const h = Buffer.alloc(2 * 2 + 3 * 4 + 2 * 4);
    h.writeUInt16LE(sx, 0);
    h.writeUInt16LE(sz, 2);
    h.writeFloatLE(bmin[0], 4);
    h.writeFloatLE(mesh.bminY, 8);
    h.writeFloatLE(bmin[2], 12);
    h.writeUInt32LE(mesh.verts.length / 3, 16);
    h.writeUInt32LE(mesh.areas.length, 20);
    chunks.push(h, Buffer.from(mesh.verts.buffer), Buffer.from(mesh.polys.buffer), Buffer.from(mesh.areas.buffer));
  }
  const dest = path.join(outDir, `${row}_${col}.nav`);
  fs.writeFileSync(`${dest}.part`, Buffer.concat(chunks));
  fs.renameSync(`${dest}.part`, dest);
  return parts.reduce((n, p) => n + p.mesh.areas.length, 0);
}

await init();
const [outDir, ...files] = FINE ? args.slice(1) : args;
fs.mkdirSync(outDir, { recursive: true });
for (const file of files) {
  const t = Date.now();
  const polys = buildTile(file, outDir);
  console.log(`${path.basename(file)} ${polys} polys ${Date.now() - t} ms`);
}
