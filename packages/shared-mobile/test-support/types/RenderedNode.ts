export interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: ReadonlyArray<RenderedNode | string> | null;
}
