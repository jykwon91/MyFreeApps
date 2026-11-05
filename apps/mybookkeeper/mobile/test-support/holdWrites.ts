import api from "@platform/core/lib/api";
import type { AxiosAdapter } from "axios";

/** Reads carry on, and writes never answer: for what happens while a save is on its way. */
export function holdWrites(): void {
  const answer = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => (config.method?.toLowerCase() === "get" ? answer(config) : new Promise(() => undefined));
}
