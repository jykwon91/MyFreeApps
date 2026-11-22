import type { Motion } from "../types/Motion";
import { useReduceMotion } from "./useReduceMotion";

/** How much to animate: sheets slide and scrolls glide only once the system says Reduce Motion is off. */
export function useMotion(): Motion {
  const isAnimated = useReduceMotion() === false;
  return { isAnimated, sheetAnimation: isAnimated ? "slide" : "none" };
}
