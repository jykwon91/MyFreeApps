import api from "@platform/core/lib/api";
import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { AxiosAdapter } from "axios";

export interface RentWrite {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

export interface RentWritesServer {
  ledger: RentLedgerResponse;
  writes: RentWrite[];
  /** What the next write answers: an HTTP status (200 is success), "lost" for no answer at all. */
  answer: number | "lost";
  /** The `detail` an error answer carries. */
  detail: string;
  /** What the reminder plan read answers; its preview is none and its history is empty. */
  overview: RentReminderOverview | null;
  workspaceReads: number;
}

/** A workspace, a ledger to read, and rent writes that are recorded and answered as scripted. */
export function startRentWritesServer(ledger: RentLedgerResponse, role = "owner"): RentWritesServer {
  const server: RentWritesServer = { ledger, writes: [], answer: 200, detail: "no", overview: null, workspaceReads: 0 };
  const adapter: AxiosAdapter = async (config) => {
    const reply = (data: unknown, status = 200) => ({ data, status, statusText: "", headers: {}, config }) as never;
    if (config.url === "/organizations") {
      server.workspaceReads += 1;
      return reply([{ id: "w1", name: "Mine", org_role: role }]);
    }
    if (config.method?.toLowerCase() === "get") {
      const url = config.url ?? "";
      if (url.endsWith("/preview")) return reply(null);
      if (url.endsWith("/sends")) return reply([]);
      return reply(url.startsWith("/rent-reminders/") ? server.overview : server.ledger);
    }
    server.writes.push({
      method: (config.method ?? "").toUpperCase(),
      url: config.url ?? "",
      body: typeof config.data === "string" ? (JSON.parse(config.data) as Record<string, unknown>) : null,
    });
    if (server.answer === "lost") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (server.answer >= 400) {
      return Promise.reject(
        Object.assign(new Error("HTTP"), { config, response: { data: { detail: server.detail }, status: server.answer, statusText: "", headers: {}, config } }),
      );
    }
    return reply({ id: "new" });
  };
  api.defaults.adapter = adapter;
  return server;
}
