import api from "@platform/core/lib/api";
import type { AxiosAdapter } from "axios";

/** The workspace list answers and every other request never does: for what shows while a screen is still loading. */
export function holdReads(): void {
  const answer = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => (config.url === "/organizations" ? answer(config) : new Promise(() => undefined));
}
