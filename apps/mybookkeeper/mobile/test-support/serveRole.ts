import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from "axios";

type Role = "owner" | "admin" | "user" | "viewer";

function workspaceAnswer(role: Role, config: AxiosRequestConfig): AxiosResponse {
  return { data: [{ id: "w1", name: "Mine", org_role: role, is_demo: false }], status: 200, statusText: "", headers: {}, config } as AxiosResponse;
}

/** Answers the workspace list with one role and records every other request, none of which ever answer. */
export function serveRole(role: Role): AxiosRequestConfig[] {
  const others: AxiosRequestConfig[] = [];
  api.defaults.adapter = ((config) => {
    if (config.url === "/organizations") return Promise.resolve(workspaceAnswer(role, config));
    others.push(config);
    return new Promise(() => undefined);
  }) as AxiosAdapter;
  return others;
}

/** Like serveRole, but the workspace list waits until release() so a test can see what shows before the role is known. */
export function serveRoleLater(role: Role): { requests: AxiosRequestConfig[]; release: () => void } {
  const requests: AxiosRequestConfig[] = [];
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.defaults.adapter = (async (config) => {
    if (config.url === "/organizations") {
      await released;
      return workspaceAnswer(role, config);
    }
    requests.push(config);
    return new Promise(() => undefined);
  }) as AxiosAdapter;
  return { requests, release };
}
