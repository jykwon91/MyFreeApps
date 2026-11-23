/** A material a craft uses. `count` is how many one craft takes; a text-only route row has none. */
export interface AddonMat {
  id: number;
  name: string;
  count: number | null;
}
