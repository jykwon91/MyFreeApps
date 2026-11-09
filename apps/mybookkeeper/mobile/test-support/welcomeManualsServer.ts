import { MAX_FIELDS_PER_SECTION, WELCOME_MANUAL_GUIDE_PATH, WELCOME_MANUAL_MAX_SECTION_IMAGES, WELCOME_MANUAL_MAX_SECTIONS } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSendStatus } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-send-status";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";
import { aField, anImage, aPlace, aRoom, aSection } from "./aWelcomeManual";

export interface WelcomeManualsServer {
  role: string;
  manuals: WelcomeManualResponse[];
  /** Everything asked of the server except the workspace list, in order. */
  requests: AxiosRequestConfig[];
  failReadsWith: number | null;
  /** A write whose method and url this accepts fails with the status and detail it returns. */
  failWhen: ((method: string, url: string) => { status: number; detail: string } | null) | null;
  /** A write is saved, then the answer is lost. */
  loseAnswerAfterSaving: boolean;
  offline: boolean;
  storageConfigured: boolean;
  emailStatus: WelcomeManualSendStatus;
  /** Reorders answer 409 until this is false, as if the list had changed elsewhere. */
  listChangedElsewhere: boolean;
}

type Body = Record<string, unknown>;
type Respond = (data: unknown, status?: number) => AxiosPromise;
type Collection = { id: string; display_order: number }[];

const PAGE = 25;

/** Answers the whole welcome-manuals API like the server does, and remembers what it was asked. */
export function startWelcomeManualsServer(initial: { manuals?: WelcomeManualResponse[]; role?: string } = {}): WelcomeManualsServer {
  const server: WelcomeManualsServer = {
    role: initial.role ?? "owner", manuals: initial.manuals ?? [], requests: [], failReadsWith: null, failWhen: null,
    loseAnswerAfterSaving: false, offline: false, storageConfigured: true, emailStatus: "sent", listChangedElsewhere: false,
  };
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${++counter}`;

  const adapter: AxiosAdapter = (config) => {
    const respond: Respond = (data, status = 200) => {
      // A real device hands back an empty string for a 204, not undefined.
      const body = status === 204 ? "" : data === undefined ? data : JSON.parse(JSON.stringify(data));
      const response = { data: body, status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response as AxiosResponse);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const url = config.url ?? "";
    if (url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role, is_demo: false }]);
    if (url === "/properties") return respond([{ id: "pr1", name: "Oak Street" }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const method = (config.method ?? "get").toLowerCase();
    if (method === "get" && server.failReadsWith) return respond({ detail: "nope" }, server.failReadsWith);
    if (method !== "get") {
      if (server.role === "viewer") return respond({ detail: "nope" }, 403);
      const failure = server.failWhen?.(method, url);
      if (failure) return respond({ detail: failure.detail }, failure.status);
    }
    const answer = route(server, method, url, config, respond, nextId);
    if (method !== "get" && server.loseAnswerAfterSaving) {
      server.loseAnswerAfterSaving = false;
      return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    }
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

function bodyOf(config: AxiosRequestConfig): Body {
  return typeof config.data === "string" && config.data ? (JSON.parse(config.data) as Body) : {};
}

/** The ids sent are exactly the ids held, in any order; otherwise the list changed under the client. */
function isPermutation(sent: unknown, held: Collection): sent is string[] {
  return Array.isArray(sent) && sent.length === held.length && held.every((item) => sent.includes(item.id));
}

function applyOrder<T extends { id: string; display_order: number }>(held: T[], ids: string[]): T[] {
  const ordered = ids.map((id) => held.find((item) => item.id === id) as T);
  ordered.forEach((item, index) => { item.display_order = index; });
  return ordered;
}

function route(server: WelcomeManualsServer, method: string, url: string, config: AxiosRequestConfig, respond: Respond, nextId: (prefix: string) => string): AxiosPromise {
  const [, , manualId, kind, kindId, sub, subId] = url.split("/");
  const sent = bodyOf(config);
  const missing = (what: string) => respond({ detail: `${what} not found` }, 404);

  if (!manualId) {
    if (method === "get") {
      const params = (config.params ?? {}) as { limit?: number; offset?: number };
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? PAGE);
      const items = server.manuals.map((manual) => ({ id: manual.id, title: manual.title, property_id: manual.property_id, section_count: manual.sections.length, created_at: manual.created_at, updated_at: manual.updated_at }));
      return respond({ items: items.slice(offset, offset + limit), total: items.length, has_more: offset + limit < items.length });
    }
    const made = { ...sentManual(sent), id: nextId("made") } as WelcomeManualResponse;
    if (sent.seed_default_sections) made.sections = ["Wi-Fi", "Parking"].map((title, index) => aSection({ id: nextId("seed"), title, display_order: index, manual_id: made.id }));
    server.manuals.push(made);
    return respond(made, 201);
  }
  const manual = server.manuals.find((candidate) => candidate.id === manualId);
  if (!manual) return missing("Welcome manual");
  if (!kind) {
    if (method === "get") return respond(manual);
    if (method === "delete") {
      server.manuals = server.manuals.filter((candidate) => candidate !== manual);
      return respond(undefined, 204);
    }
    Object.assign(manual, sent);
    return respond(manual);
  }
  if (kind === "email") return respond({ id: nextId("send"), manual_id: manual.id, recipient_email: sent.recipient_email, recipient_name: sent.recipient_name ?? null, status: server.emailStatus, error_reason: null, created_at: manual.created_at });
  if (kind === "share") return share(manual, method, respond);
  if (kind === "rooms") return crud(manual.rooms, method, kindId, sent, respond, missing, (data) => aRoom({ id: nextId("room"), manual_id: manual.id, display_order: manual.rooms.length, ...data }), "Room");
  if (kind === "places") return crud(manual.places, method, kindId, sent, respond, missing, (data) => aPlace({ id: nextId("place"), manual_id: manual.id, display_order: manual.places.length, ...data }), "Place");
  if (kind !== "sections") return missing("Route");
  if (kindId === "order") {
    if (server.listChangedElsewhere || !isPermutation(sent.section_ids, manual.sections)) return respond({ detail: "section_ids must be a permutation of the manual's current sections" }, 409);
    manual.sections = applyOrder(manual.sections, sent.section_ids as string[]);
    return respond(manual.sections);
  }
  if (!kindId) {
    if (manual.sections.length >= WELCOME_MANUAL_MAX_SECTIONS) return respond({ detail: `A manual can have at most ${WELCOME_MANUAL_MAX_SECTIONS} sections` }, 409);
    const made = aSection({ id: nextId("section"), manual_id: manual.id, display_order: manual.sections.length, fields: [], images: [], ...(sent as object) });
    manual.sections.push(made);
    return respond(made, 201);
  }
  const section = manual.sections.find((candidate) => candidate.id === kindId);
  if (!section) return missing("Section");
  if (!sub) {
    if (method === "delete") {
      manual.sections = manual.sections.filter((candidate) => candidate !== section);
      return respond(undefined, 204);
    }
    Object.assign(section, sent);
    return respond(section);
  }
  if (sub === "fields") {
    if (subId === "order") {
      if (server.listChangedElsewhere || !isPermutation(sent.field_ids, section.fields)) return respond({ detail: "field_ids must be a permutation of the section's current fields" }, 409);
      section.fields = applyOrder(section.fields, sent.field_ids as string[]);
      return respond(section.fields);
    }
    if (method === "post" && section.fields.length >= MAX_FIELDS_PER_SECTION) return respond({ detail: `A section can have at most ${MAX_FIELDS_PER_SECTION} fields` }, 409);
    return crud(section.fields, method, subId, sent, respond, missing, (data) => aField({ id: nextId("field"), section_id: section.id, display_order: section.fields.length, ...data }), "Field");
  }
  if (sub === "images") return images(server, section, method, subId, sent, config, respond, missing, nextId);
  return missing("Route");
}

function sentManual(sent: Body): Partial<WelcomeManualResponse> {
  const { seed_default_sections: _seed, ...rest } = sent;
  return { organization_id: "o1", user_id: "u1", property_id: null, intro_text: null, rooms: [], sections: [], places: [], share_token: null, share_pin: null, created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z", ...(rest as Partial<WelcomeManualResponse>) };
}

function crud<T extends { id: string }>(held: T[], method: string, id: string | undefined, sent: Body, respond: Respond, missing: (what: string) => AxiosPromise, make: (data: Body) => T, what: string): AxiosPromise {
  if (method === "post") {
    const made = make(sent);
    held.push(made);
    return respond(made, 201);
  }
  const row = held.find((candidate) => candidate.id === id);
  if (!row) return missing(what);
  if (method === "delete") {
    held.splice(held.indexOf(row), 1);
    return respond(undefined, 204);
  }
  Object.assign(row, sent);
  return respond(row);
}

function share(manual: WelcomeManualResponse, method: string, respond: Respond): AxiosPromise {
  if (method === "delete") {
    manual.share_token = null;
    manual.share_pin = null;
    return respond(undefined, 204);
  }
  manual.share_token = manual.share_token ?? "tok123";
  manual.share_pin = method === "patch" ? String(Number(manual.share_pin ?? "1000") + 1111).slice(-4) : "1234";
  return respond({ share_token: manual.share_token, share_path: `${WELCOME_MANUAL_GUIDE_PATH}/${manual.share_token}`, share_pin: manual.share_pin });
}

function images(server: WelcomeManualsServer, section: ReturnType<typeof aSection>, method: string, subId: string | undefined, sent: Body, config: AxiosRequestConfig, respond: Respond, missing: (what: string) => AxiosPromise, nextId: (prefix: string) => string): AxiosPromise {
  if (subId === "order") {
    if (server.listChangedElsewhere || !isPermutation(sent.image_ids, section.images)) return respond({ detail: "image_ids must be a permutation of the section's current images" }, 409);
    section.images = applyOrder(section.images, sent.image_ids as string[]);
    return respond(section.images);
  }
  if (method === "post") {
    if (!server.storageConfigured) return respond({ detail: "Storage not configured" }, 503);
    const parts = (config.data as { getParts: () => { fieldName: string; name: string }[] }).getParts().filter((part) => part.fieldName === "files");
    const huge = parts.find((part) => part.name.includes("huge"));
    // The wording is the server's, which the phone must never show as it is.
    if (huge) return respond({ detail: "file exceeds 10MB limit" }, 413);
    const odd = parts.find((part) => part.name.endsWith(".bmp"));
    if (odd) return respond({ detail: "unsupported file type (sniffed=image/bmp, declared=image/jpeg)" }, 415);
    if (section.images.length + parts.length > WELCOME_MANUAL_MAX_SECTION_IMAGES) return respond({ detail: `A section can have at most ${WELCOME_MANUAL_MAX_SECTION_IMAGES} photos` }, 409);
    const made = parts.map((part) => anImage({ id: nextId("image"), section_id: section.id, caption: null, storage_key: part.name, display_order: section.images.length }));
    section.images.push(...made);
    return respond(made, 201);
  }
  return crud(section.images, method, subId, sent, respond, missing, () => anImage(), "Photo");
}
