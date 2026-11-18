import type { Href } from "expo-router";
import type { ReactNode } from "react";

export interface ValidRouteParamsProps {
  /** Names of route params that must be record UUIDs. */
  uuids?: readonly string[];
  /** Names of route params that must be four-digit years. */
  years?: readonly string[];
  /** Names of route params that must be positive whole numbers. */
  integers?: readonly string[];
  heading: string;
  body: string;
  backLabel: string;
  /** Where Back goes when the screen was opened cold from a link. */
  fallbackRoute: Href;
  children: ReactNode;
}
