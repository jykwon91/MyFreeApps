import type { ScreenMapRoute } from "./ScreenMapRoute";

export interface ScreenMap {
  routes: Record<string, ScreenMapRoute>;
}
