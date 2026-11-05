import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type { FakeInquiryServer } from "./inquiriesServer";

type Respond = (data: unknown, status?: number) => Promise<AxiosResponse>;
type Committed = { data: unknown; status: number };

function nameIsTaken(server: FakeInquiryServer, name: string, ownId?: string): boolean {
  return [...server.templates, ...server.archivedTemplates].some((row) => row.name === name && row.id !== ownId);
}

function commit(config: AxiosRequestConfig, server: FakeInquiryServer): Committed {
  const id = (config.url ?? "").split("/")[2];
  const sent = config.data ? (JSON.parse(String(config.data)) as Partial<ReplyTemplate>) : {};
  if (config.method === "post") {
    if (sent.name && nameIsTaken(server, sent.name)) return { data: { detail: "A template with this name already exists" }, status: 409 };
    const now = new Date().toISOString();
    const row: Partial<ReplyTemplate> = {
      id: `made${server.templates.length + server.archivedTemplates.length + 1}`,
      organization_id: "o",
      user_id: "u",
      is_archived: false,
      display_order: 0,
      created_at: now,
      updated_at: now,
      ...sent,
    };
    server.templates.push(row);
    return { data: row, status: 201 };
  }
  const archived = server.archivedTemplates.find((candidate) => candidate.id === id);
  // An archived template can only be restored; anything else treats it as gone.
  if (archived && config.method === "patch" && sent.is_archived === false) {
    Object.assign(archived, sent);
    server.archivedTemplates = server.archivedTemplates.filter((candidate) => candidate !== archived);
    server.templates.push(archived);
    return { data: archived, status: 200 };
  }
  const row = server.templates.find((candidate) => candidate.id === id);
  if (!row) return { data: { detail: "Reply template not found" }, status: 404 };
  if (config.method === "delete" || sent.is_archived === true) {
    server.templates = server.templates.filter((candidate) => candidate !== row);
    Object.assign(row, sent, { is_archived: true });
    server.archivedTemplates.push(row);
    return config.method === "delete" ? { data: undefined, status: 204 } : { data: row, status: 200 };
  }
  if (sent.name && nameIsTaken(server, sent.name, id)) return { data: { detail: "A template with this name already exists" }, status: 409 };
  Object.assign(row, sent);
  return { data: row, status: 200 };
}

/** Answers a create, change, archive or restore of a reply template, like the server does. */
export function answerTemplateWrite(config: AxiosRequestConfig, server: FakeInquiryServer, respond: Respond): Promise<AxiosResponse> {
  const lost = () => Promise.reject(Object.assign(new Error("Network Error"), { config }));
  if (server.role === "viewer") return respond({ detail: "nope" }, 403);
  if (server.failWritesWith) return respond({ detail: "nope" }, server.failWritesWith);
  if (server.templateWriteOutcome === "lostBeforeSaving") return lost();
  const { data, status } = commit(config, server);
  if (server.templateWriteOutcome === "lostAfterSaving") return lost();
  if (server.templateWriteOutcome === "lostAndOffline") {
    server.offline = true;
    return lost();
  }
  if (server.templateWriteOutcome === "gatewayAfterSaving") return respond("<html>502 Bad Gateway</html>", 502);
  return respond(data, status);
}
