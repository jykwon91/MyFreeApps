import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import type { ListingBlackoutAttachment } from "@mybookkeeper/api-client/types/calendar/listing-blackout-attachment";
import type { ReviewQueueItem } from "@mybookkeeper/api-client/types/calendar/review-queue-item";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { formParts } from "./applicantsServer";

export function anEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    listing_id: "li1",
    listing_name: "Maple Room",
    property_id: "p1",
    property_name: "Elm House",
    starts_on: "2026-11-10",
    ends_on: "2026-11-14",
    source: "airbnb",
    source_event_id: "x",
    summary: null,
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

export function anAttachment(overrides: Partial<ListingBlackoutAttachment> = {}): ListingBlackoutAttachment {
  return {
    id: "f1",
    listing_blackout_id: "e1",
    storage_key: "k",
    filename: "confirmation.pdf",
    content_type: "application/pdf",
    size_bytes: 2048,
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-11-02T12:00:00Z",
    presigned_url: "https://files.example/first",
    is_available: true,
    ...overrides,
  };
}

export function aQueueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: "q1",
    email_message_id: "m1",
    source_channel: "airbnb",
    parsed_payload: {
      source_channel: "airbnb",
      source_listing_id: "air-77",
      guest_name: "Sam Lee",
      check_in: "2026-12-02",
      check_out: "2026-12-06",
      total_price: "$640.00",
      raw_subject: "Reservation confirmed - Sam Lee",
    },
    status: "pending",
    created_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

export interface FakeCalendarServer {
  events: CalendarEvent[] | "fail";
  properties: { id: string; name: string }[];
  listings: { id: string; title: string }[];
  queue: ReviewQueueItem[] | "fail";
  attachments: Record<string, ListingBlackoutAttachment[]>;
  role: string;
  offline: boolean;
  /** Status for the next writes (notes, files, queue decisions); null for success. */
  writeFailure: number | null;
  attachmentsFailure: number | null;
  requests: AxiosRequestConfig[];
}

export function startCalendarServer(overrides: Partial<FakeCalendarServer> = {}): FakeCalendarServer {
  const server: FakeCalendarServer = {
    events: [],
    properties: [],
    listings: [{ id: "li1", title: "Maple Room" }, { id: "li2", title: "Birch Room" }],
    queue: [],
    attachments: {},
    role: "owner",
    offline: false,
    writeFailure: null,
    attachmentsFailure: null,
    requests: [],
    ...overrides,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data ?? null)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config, isAxiosError: true }));
    const url = config.url ?? "";
    const method = (config.method ?? "get").toLowerCase();
    const events = server.events === "fail" ? [] : server.events;
    const queue = server.queue === "fail" ? [] : server.queue;
    const isWrite = method !== "get";
    const failed = isWrite && server.writeFailure !== null;

    if (url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (url === "/calendar/events") return server.events === "fail" ? respond({ detail: "down" }, 500) : respond(server.events);
    if (url === "/properties") return respond(server.properties);
    if (url === "/listings") return respond({ items: server.listings, total: server.listings.length, has_more: false });
    if (url === "/calendar/review-queue/count") return respond(queue.length);
    if (url === "/calendar/review-queue" && method === "get") return server.queue === "fail" ? respond({ detail: "down" }, 500) : respond(server.queue);

    const queueItem = /^\/calendar\/review-queue\/([^/]+)(\/resolve|\/ignore)?$/.exec(url);
    if (queueItem && isWrite) {
      if (failed) return respond({ detail: "A developer's message" }, server.writeFailure!);
      if (server.queue !== "fail") server.queue = server.queue.filter((item) => item.id !== queueItem[1]);
      if (queueItem[2] === "/resolve") {
        const body = JSON.parse(config.data as string) as { listing_id: string };
        return respond({ queue_item_id: queueItem[1], blackout: { id: "b9", listing_id: body.listing_id, starts_on: "2026-12-02", ends_on: "2026-12-06", source: "airbnb" } }, 200);
      }
      return respond(queueItem[2] === "/ignore" ? { status: "ignored" } : null, queueItem[2] ? 200 : 204);
    }

    const blackout = /^\/listings\/blackouts\/([^/]+)(\/attachments(?:\/([^/]+))?)?$/.exec(url);
    if (blackout) {
      const [, id, attachmentPath, attachmentId] = blackout;
      if (!attachmentPath && method === "patch") {
        if (failed) return respond({ detail: "A developer's message" }, server.writeFailure!);
        const body = JSON.parse(config.data as string) as { host_notes: string | null };
        const row = events.find((event) => event.id === id);
        if (row) row.host_notes = body.host_notes;
        return respond({ id, host_notes: body.host_notes });
      }
      if (attachmentPath && method === "get") {
        return server.attachmentsFailure ? respond({ detail: "nope" }, server.attachmentsFailure) : respond(server.attachments[id] ?? []);
      }
      if (attachmentPath && method === "post") {
        if (failed) return respond({ detail: "A developer's message" }, server.writeFailure!);
        const name = formParts(config.data).find((part) => part.fieldName === "file")?.name ?? "";
        const added = anAttachment({ id: `f-new${(server.attachments[id] ?? []).length}`, listing_blackout_id: id, filename: name });
        server.attachments[id] = [...(server.attachments[id] ?? []), added];
        return respond(added, 201);
      }
      if (attachmentPath && method === "delete") {
        if (failed) return respond({ detail: "A developer's message" }, server.writeFailure!);
        server.attachments[id] = (server.attachments[id] ?? []).filter((file) => file.id !== attachmentId);
        return respond(null, 204);
      }
    }
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}
