import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";
import type { SuggestPlaceholdersResponse } from "@mybookkeeper/api-client/types/lease/suggest-placeholders-response";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { formParts, formValue } from "./applicantsServer";

export interface LeaseTemplatesServer {
  role: string;
  templates: LeaseTemplateDetail[];
  /** Every write sent, in order. */
  writes: AxiosRequestConfig[];
  /** The next write whose URL contains `match` fails with this status and detail (once if `once`). */
  failNext: { match: string; status: number; detail?: unknown; once: boolean }[];
  /** The next write is saved but its answer never arrives. */
  loseNextAnswer: boolean;
  suggestions: SuggestPlaceholdersResponse | "fail";
  /** While set, the upload (or the AI read) waits for it before answering. */
  uploadGate: Promise<void> | null;
  suggestGate: Promise<void> | null;
  listReads: number;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function aServerPlaceholder(id: string, overrides: Partial<LeaseTemplatePlaceholder> = {}): LeaseTemplatePlaceholder {
  return {
    id,
    template_id: "t1",
    key: `KEY_${id}`,
    display_label: `Label ${id}`,
    input_type: "text",
    required: true,
    default_source: null,
    computed_expr: null,
    display_order: Number(id.replace(/\D/g, "")) || 0,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

export function aServerTemplate(overrides: Partial<LeaseTemplateDetail> = {}): LeaseTemplateDetail {
  return {
    id: "t1",
    user_id: "u",
    organization_id: "o",
    name: "Standard lease",
    description: null,
    version: 1,
    files: [],
    placeholders: [aServerPlaceholder("p1"), aServerPlaceholder("p2")],
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

function summaryOf(template: LeaseTemplateDetail) {
  return { ...template, file_count: template.files.length, placeholder_count: template.placeholders.length };
}

/** A stateful fake of the lease template routes: what's created, edited or deleted is what the next read returns. */
export function startLeaseTemplatesServer(templates: LeaseTemplateDetail[] = [aServerTemplate()]): LeaseTemplatesServer {
  const server: LeaseTemplatesServer = {
    role: "owner",
    templates: structuredClone(templates),
    writes: [],
    failNext: [],
    loseNextAnswer: false,
    suggestions: { suggestions: [], truncated: false, pages_note: null },
    listReads: 0,
    uploadGate: null,
    suggestGate: null,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data ?? null)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const url = config.url ?? "";
    const method = (config.method ?? "get").toLowerCase();
    if (url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (method === "get") {
      if (url === "/lease-templates") {
        server.listReads += 1;
        return respond({ items: server.templates.map(summaryOf), total: server.templates.length, has_more: false });
      }
      const found = server.templates.find((template) => url === `/lease-templates/${template.id}`);
      return found ? respond(found) : respond({ detail: "Not found" }, 404);
    }

    server.writes.push(config);
    const failure = server.failNext.find((candidate) => url.includes(candidate.match));
    if (failure) {
      if (failure.once) server.failNext.splice(server.failNext.indexOf(failure), 1);
      return respond({ detail: failure.detail ?? "Something went wrong" }, failure.status);
    }
    const lost = server.loseNextAnswer;
    server.loseNextAnswer = false;
    const answer = (data: unknown, status = 200) => (lost ? Promise.reject(Object.assign(new Error("Network Error"), { config, isAxiosError: true })) : respond(data, status));

    if (method === "post" && url === "/lease-templates") {
      const created = aServerTemplate({
        id: `t${server.templates.length + 1}`,
        name: formValue(config.data, "name") ?? "",
        description: formValue(config.data, "description") ?? null,
        files: formParts(config.data)
          .filter((part) => part.fieldName === "files")
          .map((part, index) => ({ id: `f${index}`, template_id: "new", filename: part.name ?? "", storage_key: "k", content_type: part.type ?? DOCX, size_bytes: 10, display_order: index, created_at: "2026-01-01T12:00:00Z", presigned_url: null, is_available: true })),
        placeholders: [],
      });
      server.templates.push(created);
      return server.uploadGate ? server.uploadGate.then(() => answer(created, 201)) : answer(created, 201);
    }
    const suggest = /^\/lease-templates\/([^/]+)\/suggest-placeholders$/.exec(url);
    if (suggest && method === "post") {
      const reply = () => (server.suggestions === "fail" ? respond({ detail: "AI down" }, 502) : respond(server.suggestions));
      return server.suggestGate ? server.suggestGate.then(reply) : reply();
    }
    const patch = /^\/lease-templates\/([^/]+)\/placeholders\/([^/]+)$/.exec(url);
    if (patch && method === "patch") {
      const placeholder = server.templates.find((template) => template.id === patch[1])?.placeholders.find((candidate) => candidate.id === patch[2]);
      if (!placeholder) return respond({ detail: "Not found" }, 404);
      Object.assign(placeholder, JSON.parse(String(config.data)));
      return answer(placeholder);
    }
    const remove = /^\/lease-templates\/([^/]+)$/.exec(url);
    if (remove && method === "delete") {
      const before = server.templates.length;
      server.templates = server.templates.filter((template) => template.id !== remove[1]);
      return before === server.templates.length ? respond({ detail: "Not found" }, 404) : answer(null, 204);
    }
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

/** What the real server says, word for word (``lease_template_service`` and ``api/lease_templates.py``). */
export const TOO_BIG_DETAIL = "lease.md exceeds 25MB limit";
export const BAD_TYPE_DETAIL = "lease.exe: unsupported file type (application/octet-stream). Allowed: .md, .txt, .docx";
