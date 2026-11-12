import type { RenderedNode } from "./types/RenderedNode";

/** Every host node of `type` in a `screen.toJSON()` tree, outermost first. */
export function nodesOfType(node: RenderedNode | string | null, type: string): RenderedNode[] {
  if (node === null || typeof node === "string") return [];
  const below = (node.children ?? []).flatMap((child) => nodesOfType(child, type));
  return node.type === type ? [node, ...below] : below;
}
