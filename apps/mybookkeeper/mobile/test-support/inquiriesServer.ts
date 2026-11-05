import api from "@platform/core/lib/api";
import type { InquiryMessage } from "@mybookkeeper/api-client/types/inquiry/inquiry-message";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { InquirySpamAssessment } from "@mybookkeeper/api-client/types/inquiry/inquiry-spam-assessment";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { answerTemplateWrite } from "./replyTemplateWrites";

export function aMessage(overrides: Partial<InquiryMessage> = {}): InquiryMessage {
  return {
    id: "m1",
    inquiry_id: "i1",
    direction: "inbound",
    channel: "email",
    from_address: "dana@example.com",
    to_address: null,
    subject: "Room",
    raw_email_body: null,
    parsed_body: "Is the room still open?",
    email_message_id: null,
    sent_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    ...overrides,
  };
}

export function anInquiry(overrides: Partial<InquiryResponse> = {}): InquiryResponse {
  return {
    id: "i1",
    listing_id: null,
    source: "direct",
    stage: "new",
    inquirer_name: "Dana Reed",
    inquirer_email: "dana@example.com",
    inquirer_phone: "(555) 010-2030",
    inquirer_employer: "Memorial Hospital",
    desired_start_date: "2026-12-01",
    desired_end_date: "2027-03-01",
    gut_rating: null,
    notes: null,
    received_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    linked_applicant_id: null,
    spam_status: "unscored",
    spam_score: null,
    messages: [aMessage()],
    events: [],
    ...overrides,
  } as InquiryResponse;
}

function toSummary(inquiry: InquiryResponse): InquirySummary {
  return { ...inquiry, submitted_via: "gmail_oauth", last_message_preview: inquiry.messages[0]?.parsed_body ?? null, last_message_at: null };
}

export interface FakeInquiryServer {
  inquiries: InquiryResponse[];
  assessments: InquirySpamAssessment[];
  listingTitle: string | null;
  role: string;
  offline: boolean;
  /** The status every inquiry write fails with, while set. */
  failWritesWith: number | null;
  /** Fails list requests at or past this offset, while set. */
  failListFromOffset: number | null;
  integrations: Partial<Integration>[];
  templates: Partial<ReplyTemplate>[];
  failTemplateRender: boolean;
  /** Names of templates that were archived: they stay taken. */
  archivedTemplateNames: string[];
  /** How the next template write ends. "lost" ones commit (or not) but never answer. */
  /** Saved, then: the answer lost; the answer lost and the network gone; or the proxy's own 502. */
  templateWriteOutcome: "lostAfterSaving" | "lostBeforeSaving" | "lostAndOffline" | "gatewayAfterSaving" | null;
  /** How the next send ends. A number is a failure with that status. */
  sendOutcome: { status: number; detail?: string } | "lostAfterSending" | "lostBeforeSending" | null;
  requests: AxiosRequestConfig[];
}

/** Answers the app's own requests, so a screen test runs through the real API client. */
export function startInquiryServer(inquiries: InquiryResponse[]): FakeInquiryServer {
  const server: FakeInquiryServer = {
    inquiries,
    assessments: [],
    listingTitle: null,
    role: "owner",
    offline: false,
    failWritesWith: null,
    failListFromOffset: null,
    integrations: [{ provider: "gmail", has_send_scope: true, needs_reauth: false }],
    templates: [],
    failTemplateRender: false,
    archivedTemplateNames: [],
    templateWriteOutcome: null,
    sendOutcome: null,
    requests: [],
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      // A copy, as the real API sends: the store freezes what it's given, and the rows here keep changing.
      const response = { data: data === undefined ? data : JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/integrations") return respond(server.integrations);
    if (config.url === "/reply-templates" && config.method === "get") return respond(server.templates);
    if (config.url?.startsWith("/reply-templates")) return answerTemplateWrite(config, server, respond);
    if (config.url === "/inquiries") {
      const params = (config.params ?? {}) as Record<string, string | number | boolean | undefined>;
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 25);
      if (server.failListFromOffset !== null && offset >= server.failListFromOffset) return respond({ detail: "nope" }, 500);
      const matches = server.inquiries.filter(
        (row) =>
          (!params.stage || row.stage === params.stage) &&
          (!params.spam_status || row.spam_status === params.spam_status) &&
          (!params.inbox_only || !["flagged", "spam"].includes(row.spam_status)),
      );
      const items = matches.slice(offset, offset + limit).map(toSummary);
      return respond({ items, total: matches.length, has_more: offset + limit < matches.length });
    }
    if (config.url?.startsWith("/listings/")) {
      return server.listingTitle ? respond({ id: "l1", title: server.listingTitle }) : respond({ detail: "nope" }, 404);
    }
    const [, , id, action] = (config.url ?? "").split("/");
    const inquiry = server.inquiries.find((row) => row.id === id);
    if (config.method !== "get" && server.failWritesWith) return respond({ detail: "nope" }, server.failWritesWith);
    if (!inquiry) return respond({ detail: "Inquiry not found" }, 404);
    if (action === "spam-assessments") return respond(server.assessments);
    if (action === "render-template") {
      if (server.failTemplateRender) return respond({ detail: "nope" }, 500);
      return respond({ subject: `Subject from ${config.url?.split("/").pop()}`, body: "Hello from the template" });
    }
    if (action === "reply") {
      const outcome = server.sendOutcome;
      if (outcome && typeof outcome === "object") return respond({ detail: outcome.detail ?? "nope" }, outcome.status);
      if (outcome === "lostBeforeSending") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      const sent = JSON.parse(String(config.data)) as { body: string };
      const message = aMessage({
        id: `sent${inquiry.messages.length}`,
        direction: "outbound",
        parsed_body: `Pet disclosure.\n\n${sent.body}`,
      });
      inquiry.messages = [...inquiry.messages, message];
      if (outcome === "lostAfterSending") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      return respond(message, 201);
    }
    if (action === "mark-spam" || action === "mark-not-spam") {
      inquiry.spam_status = action === "mark-spam" ? "spam" : "manually_cleared";
      return respond(inquiry);
    }
    if (config.method === "patch") {
      Object.assign(inquiry, JSON.parse(String(config.data)));
      return respond(inquiry);
    }
    if (config.method === "delete") {
      server.inquiries = server.inquiries.filter((row) => row !== inquiry);
      return respond(undefined, 204);
    }
    return respond(inquiry);
  };
  api.defaults.adapter = adapter;
  return server;
}

export function lastInquiryWrite(server: FakeInquiryServer): { method: string | undefined; url: string | undefined; body: unknown } | null {
  const write = [...server.requests].reverse().find((request) => request.method !== "get");
  if (!write) return null;
  return { method: write.method, url: write.url, body: write.data ? JSON.parse(String(write.data)) : undefined };
}
