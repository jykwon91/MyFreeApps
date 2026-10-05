/** Test helper: writes a `.walk` file the way the generator does. */
import { WALK_EDGE } from "@/games/wow-forever/worldMap/walkGraph";

export interface TestNode {
  x: number;
  y: number;
  z: number;
  label: number;
  water?: boolean;
  /** Flag bits: 2 = hostile to an Alliance walker, 4 = to a Horde one. */
  hostile?: number;
}

/** `yards` (walked) defaults to the cost: no road preference. */
export type TestEdge = [a: number, b: number, cost: number, kind?: number, yards?: number];

/**
 * Writes the generator's layout (`backend/scripts/wow_world_map/walk/export.py`).
 * `hubCost` is the Alliance walker's matrix; the Horde one defaults to the same.
 */
export function encode(
  mapId: number,
  nodes: TestNode[],
  edges: TestEdge[],
  labels: [string, string, number, number?][],
  hubs: { key: string; node: number }[] = [],
  hubCost: number[] = [],
  instance = false,
  hordeHubCost: number[] = hubCost,
): ArrayBuffer {
  const meta = { labels, hubs: hubs.map((h) => h.key), ...(instance ? { instance: 1 } : {}) };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const n = nodes.length;
  const m = edges.length;
  const h = hubs.length;
  const size = 24 + 9 * n + 13 * m + 4 * h + 4 * h * h + json.length;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  [..."MGWK"].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint16(4, 3, true);
  view.setUint16(6, mapId, true);
  view.setUint32(8, n, true);
  view.setUint32(12, m, true);
  view.setUint32(16, h, true);
  view.setUint32(20, json.length, true);
  let at = 24;
  for (const key of ["x", "y", "z"] as const) {
    for (const node of nodes) {
      view.setInt16(at, node[key], true);
      at += 2;
    }
  }
  for (const node of nodes) {
    view.setUint16(at, node.label, true);
    at += 2;
  }
  for (const node of nodes) view.setUint8(at++, (node.water ? 1 : 0) | (node.hostile ?? 0));
  for (const e of edges) {
    view.setUint32(at, e[0], true);
    at += 4;
  }
  for (const e of edges) {
    view.setUint32(at, e[1], true);
    at += 4;
  }
  for (const e of edges) {
    view.setUint16(at, e[2], true);
    at += 2;
  }
  for (const e of edges) {
    view.setUint16(at, e[4] ?? e[2], true);
    at += 2;
  }
  for (const e of edges) view.setUint8(at++, e[3] ?? WALK_EDGE.walk);
  for (const hub of hubs) {
    view.setUint32(at, hub.node, true);
    at += 4;
  }
  for (const c of [...hubCost, ...hordeHubCost]) {
    view.setUint16(at, c, true);
    at += 2;
  }
  new Uint8Array(buf, at).set(json);
  return buf;
}
