/**
 * A continent's walk graph (`public/wow-walk/<mapId>.walk`), generated from
 * the Forever client's terrain, buildings and doodads by
 * `backend/scripts/wow_world_map/walk/` — see `export.py` there for the layout.
 *
 * Nodes are patches of walkable ground (or water) a few yards to ~30 yd
 * across, each labelled with the room / sub-area it lies in ("The Great
 * Forge", "Kharanos"). Edges carry "ground yards" — yards at run speed, so
 * swimming counts more than its length — twice: the cost, where a yard off
 * the road counts more so routes keep to the roads, and the yards actually
 * walked, which time the walk. The file also carries the yards walked between
 * every pair of travel hubs (flight masters, docks, the tram).
 */
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";

const MAGIC = "MGWK";
const VERSION = 2;
const UNREACHABLE = 0xffff;
const GZIP_MAGIC = [0x1f, 0x8b];
const HEADER_BYTES = 24;
const FLAG_WATER = 1;

/** Kinds from `drop` up go one way only, a -> b (a dungeon's ledges and one-way teleports). */
export const WALK_EDGE = { walk: 0, lift: 1, portal: 2, drop: 3, teleport: 4 } as const;
export type WalkEdgeKind = (typeof WALK_EDGE)[keyof typeof WALK_EDGE];

function isOneWay(kind: number): boolean {
  return kind >= WALK_EDGE.drop;
}

/** A portal / teleporter hop covers no ground — leave it out of a walk's yards. */
export function isJump(kind: WalkEdgeKind): boolean {
  return kind === WALK_EDGE.portal || kind === WALK_EDGE.teleport;
}

export interface WalkLabel {
  /** Room or sub-area: "The Great Forge", "Kharanos" — "" when the ground has none. */
  name: string;
  /** Zone: "Ironforge", "Dun Morogh". */
  zone: string;
  indoor: boolean;
  /** The zone is a capital city — directions there go turn by turn. */
  city: boolean;
}

export interface WalkGraph {
  mapId: number;
  size: number;
  x: Int16Array;
  y: Int16Array;
  z: Int16Array;
  label: Uint16Array;
  water: Uint8Array;
  /** CSR adjacency: node i's edges are `[start[i], start[i + 1])`. */
  start: Uint32Array;
  to: Uint32Array;
  /** What picks the path: ground yards, a yard off the road counting more. */
  cost: Uint16Array;
  /** Ground yards actually walked: what a walk takes. */
  yards: Uint16Array;
  kind: Uint8Array;
  labels: readonly WalkLabel[];
  /** A dungeon's graph: its hubs are entrances (`e<trigger>`) and bosses (`b<encounter>`). */
  instance: boolean;
  /** Travel hub key (`t<flight node id>`, `s<transport id>.<stop>`) -> hub row. */
  hubRow: ReadonlyMap<string, number>;
  hubNode: Uint32Array;
  /** Hub-to-hub ground yards walked along the cheapest path, row-major; `UNREACHABLE` = no path. */
  hubCost: Uint16Array;
}

function copy<T>(bytes: Uint8Array, offset: number, length: number, make: (b: ArrayBuffer) => T): T {
  return make(bytes.slice(offset, offset + length).buffer);
}

/** Decode a walk file (raw or gzipped bytes already inflated — see `loadWalkGraph`). */
export function decodeWalkGraph(buffer: ArrayBuffer): WalkGraph {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MAGIC) throw new Error("not a walk graph");
  const version = view.getUint16(4, true);
  if (version !== VERSION) throw new Error(`walk graph version ${version} is not supported`);
  const mapId = view.getUint16(6, true);
  const n = view.getUint32(8, true);
  const m = view.getUint32(12, true);
  const h = view.getUint32(16, true);
  const jsonBytes = view.getUint32(20, true);

  let at = HEADER_BYTES;
  const take = <T>(length: number, make: (b: ArrayBuffer) => T): T => {
    const out = copy(bytes, at, length, make);
    at += length;
    return out;
  };
  const x = take(2 * n, (b) => new Int16Array(b));
  const y = take(2 * n, (b) => new Int16Array(b));
  const z = take(2 * n, (b) => new Int16Array(b));
  const label = take(2 * n, (b) => new Uint16Array(b));
  const flags = take(n, (b) => new Uint8Array(b));
  const a = take(4 * m, (b) => new Uint32Array(b));
  const bEnd = take(4 * m, (b) => new Uint32Array(b));
  const edgeCost = take(2 * m, (b) => new Uint16Array(b));
  const edgeYards = take(2 * m, (b) => new Uint16Array(b));
  const edgeKind = take(m, (b) => new Uint8Array(b));
  const hubNode = take(4 * h, (b) => new Uint32Array(b));
  const hubCost = take(2 * h * h, (b) => new Uint16Array(b));
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + jsonBytes))) as {
    labels: [string, string, number, number?][];
    hubs: string[];
    instance?: number;
  };

  // Edges -> CSR: both directions, a one-way kind a -> b only.
  const degree = new Uint32Array(n + 1);
  for (let i = 0; i < m; i++) {
    degree[a[i] + 1]++;
    if (!isOneWay(edgeKind[i])) degree[bEnd[i] + 1]++;
  }
  for (let i = 0; i < n; i++) degree[i + 1] += degree[i];
  const start = degree;
  const fill = start.slice(0, n);
  const slots = start[n];
  const to = new Uint32Array(slots);
  const cost = new Uint16Array(slots);
  const yards = new Uint16Array(slots);
  const kind = new Uint8Array(slots);
  for (let i = 0; i < m; i++) {
    const ways: [number, number][] = [[a[i], bEnd[i]]];
    if (!isOneWay(edgeKind[i])) ways.push([bEnd[i], a[i]]);
    for (const [u, v] of ways) {
      const slot = fill[u]++;
      to[slot] = v;
      cost[slot] = edgeCost[i];
      yards[slot] = edgeYards[i];
      kind[slot] = edgeKind[i];
    }
  }
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = flags[i] & FLAG_WATER;

  return {
    mapId,
    size: n,
    x,
    y,
    z,
    label,
    water,
    start,
    to,
    cost,
    yards,
    kind,
    labels: meta.labels.map(([name, zone, indoor, city]) => ({ name, zone, indoor: indoor === 1, city: city === 1 })),
    instance: meta.instance === 1,
    hubRow: new Map(meta.hubs.map((key, i) => [key, i])),
    hubNode,
    hubCost,
  };
}

/** A walk file's bytes: gzipped by the generator, but a server may already have inflated them. */
export async function inflateWalkFile(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (head[0] !== GZIP_MAGIC[0] || head[1] !== GZIP_MAGIC[1]) return buffer;
  const body = new Response(buffer).body;
  if (!body) throw new Error("walk graph: empty file");
  return new Response(body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

export function nodePoint(graph: WalkGraph, node: number): WorldPoint {
  return { continent: graph.mapId, wx: graph.x[node], wy: graph.y[node], z: graph.z[node] };
}

const SNAP_VERTICAL_WEIGHT = 2;
const SNAP_WATER_PENALTY = 15;
const MAX_SNAP = 60;

/**
 * The node a point stands on, or null when the graph has no ground near it.
 * Without a height (a clicked spot, a town) the nearest ground wins; with
 * one (an NPC's spawn) a floor above or below counts as further away.
 */
export function snapToGraph(graph: WalkGraph, point: WorldPoint): number | null {
  if (point.continent !== graph.mapId) return null;
  const hasZ = point.z !== undefined;
  const pz = point.z ?? 0;
  let best = -1;
  let bestScore = MAX_SNAP;
  for (let i = 0; i < graph.size; i++) {
    const dx = graph.x[i] - point.wx;
    const dy = graph.y[i] - point.wy;
    if (Math.abs(dx) > bestScore || Math.abs(dy) > bestScore) continue;
    let score = Math.hypot(dx, dy) + SNAP_WATER_PENALTY * graph.water[i];
    if (hasZ) score += SNAP_VERTICAL_WEIGHT * Math.abs(graph.z[i] - pz);
    if (score <= bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best < 0 ? null : best;
}

export interface WalkSearch {
  source: number;
  /** Cost from the source; Infinity = unreachable. */
  dist: Float64Array;
  /** Ground yards walked from the source along the cheapest path. */
  yards: Float64Array;
  /** The edge slot each node was reached by (-1 at the source / unreached). */
  via: Int32Array;
  /** The node each node was reached from. */
  prev: Int32Array;
}

/** Binary min-heap of (cost, node). */
class Heap {
  private cost: number[] = [];
  private node: number[] = [];

  get size(): number {
    return this.cost.length;
  }

  push(c: number, n: number) {
    const { cost, node } = this;
    let i = cost.length;
    cost.push(c);
    node.push(n);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (cost[parent] <= c) break;
      cost[i] = cost[parent];
      node[i] = node[parent];
      i = parent;
    }
    cost[i] = c;
    node[i] = n;
  }

  pop(): [number, number] {
    const { cost, node } = this;
    const top: [number, number] = [cost[0], node[0]];
    const lastCost = cost.pop() as number;
    const lastNode = node.pop() as number;
    const size = cost.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= size) break;
        const child = left + 1 < size && cost[left + 1] < cost[left] ? left + 1 : left;
        if (cost[child] >= lastCost) break;
        cost[i] = cost[child];
        node[i] = node[child];
        i = child;
      }
      cost[i] = lastCost;
      node[i] = lastNode;
    }
    return top;
  }
}

const searches = new WeakMap<WalkGraph, Map<number, WalkSearch>>();
const SEARCH_CACHE = 12;

/** Cheapest walk from `source` to every node (cached: a trip's planning asks for the same few sources). */
export function searchFrom(graph: WalkGraph, source: number): WalkSearch {
  let cache = searches.get(graph);
  if (!cache) {
    cache = new Map();
    searches.set(graph, cache);
  }
  const known = cache.get(source);
  if (known) return known;

  const dist = new Float64Array(graph.size).fill(Number.POSITIVE_INFINITY);
  const yards = new Float64Array(graph.size).fill(Number.POSITIVE_INFINITY);
  const via = new Int32Array(graph.size).fill(-1);
  const prev = new Int32Array(graph.size).fill(-1);
  dist[source] = 0;
  yards[source] = 0;
  const heap = new Heap();
  heap.push(0, source);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (let s = graph.start[u]; s < graph.start[u + 1]; s++) {
      const v = graph.to[s];
      const nd = d + graph.cost[s];
      if (nd < dist[v]) {
        dist[v] = nd;
        yards[v] = yards[u] + graph.yards[s];
        via[v] = s;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  const search = { source, dist, yards, via, prev };
  if (cache.size >= SEARCH_CACHE) cache.delete(cache.keys().next().value as number);
  cache.set(source, search);
  return search;
}

/** Ground yards walked between two hubs, or null when the file has no path between them. */
export function hubToHub(graph: WalkGraph, from: string, to: string): number | null {
  const i = graph.hubRow.get(from);
  const j = graph.hubRow.get(to);
  if (i === undefined || j === undefined) return null;
  const c = graph.hubCost[i * graph.hubNode.length + j];
  return c === UNREACHABLE ? null : c;
}

export function hubNodeOf(graph: WalkGraph, key: string): number | null {
  const row = graph.hubRow.get(key);
  return row === undefined ? null : graph.hubNode[row];
}

export interface WalkHop {
  node: number;
  /** How this node was reached from the previous one (walk for the first). */
  kind: WalkEdgeKind;
}

/** The nodes of the cheapest walk, source first; null when unreachable. */
export function walkPath(graph: WalkGraph, from: number, to: number): WalkHop[] | null {
  const search = searchFrom(graph, from);
  if (!Number.isFinite(search.dist[to])) return null;
  const hops: WalkHop[] = [];
  for (let v = to; v >= 0; v = search.prev[v]) {
    const slot = search.via[v];
    hops.push({ node: v, kind: (slot < 0 ? WALK_EDGE.walk : graph.kind[slot]) as WalkEdgeKind });
    if (v === from) break;
  }
  return hops.reverse();
}
