import type { TransparencyResult } from "../components/widgets/useTransparency";

/** The latest transparency result and the `baseUrl` it was requested from. */
export interface TransparencyState {
  baseUrl: string;
  result: TransparencyResult;
}
