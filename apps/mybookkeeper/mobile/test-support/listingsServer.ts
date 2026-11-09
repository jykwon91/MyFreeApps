import type { Channel } from "@mybookkeeper/api-client/types/listing/channel";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";
import { formParts } from "./applicantsServer";

export interface ListingsServer {
  role: string;
  listings: ListingResponse[];
  channels: Channel[];
  channelListings: ChannelListing[];
  properties: { id: string; name: string }[];
  /** Everything asked of the server except the workspace list, in order. */
  requests: AxiosRequestConfig[];
  failReadsFor: string[];
  /** Writes whose URL contains this fail with the status. */
  failWrites: { match: string; status: number }[];
  /** One status per photo upload, in order; a status of 0, or none left, means it is accepted. */
  uploadStatuses: number[];
  offline: boolean;
}

export function aProperty(): { id: string; name: string } {
  return { id: "p1", name: "Elm House" };
}

export function aListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: "l1",
    organization_id: "w1",
    user_id: "u1",
    property_id: "p1",
    title: "Garden room",
    description: null,
    slug: "garden-room",
    monthly_rate: "1200.00",
    weekly_rate: null,
    nightly_rate: null,
    min_stay_days: null,
    max_stay_days: null,
    room_type: "private_room",
    private_bath: true,
    parking_assigned: false,
    furnished: true,
    status: "active",
    amenities: [],
    pets_on_premises: false,
    large_dog_disclosure: null,
    photos: [],
    external_ids: [],
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

export function aPhoto(id: string, order: number, overrides: Partial<ListingPhoto> = {}): ListingPhoto {
  return { id, listing_id: "l1", storage_key: `l1/${id}.jpg`, caption: null, display_order: order, created_at: "2026-11-01T12:00:00Z", presigned_url: `https://files.example/${id}`, is_available: true, ...overrides };
}

export function aLink(id: string, overrides: Partial<ListingExternalId> = {}): ListingExternalId {
  return { id, listing_id: "l1", source: "FF", external_id: "12345", external_url: "https://ff.example/12345", created_at: "2026-11-01T12:00:00Z", ...overrides };
}

export function aChannel(id: string, name: string, overrides: Partial<Channel> = {}): Channel {
  return { id, name, supports_ical_export: true, supports_ical_import: true, created_at: "2026-01-01T00:00:00Z", ...overrides };
}

export function aChannelListing(id: string, channel: Channel, overrides: Partial<ChannelListing> = {}): ChannelListing {
  return {
    id,
    listing_id: "l1",
    channel_id: channel.id,
    channel,
    external_url: `https://${channel.name.toLowerCase()}.example/room`,
    external_id: null,
    ical_import_url: null,
    last_imported_at: null,
    last_import_error: null,
    ical_export_token: "tok",
    ical_export_url: `https://mbk.example/ical/${id}.ics`,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

type Respond = (data: unknown, status?: number) => AxiosPromise;

/** Answers the workspace list, properties, listings, photos, links and channels like the server does. */
export function startListingsServer(initial: Partial<Pick<ListingsServer, "role" | "listings" | "channels" | "channelListings">> = {}): ListingsServer {
  const server: ListingsServer = {
    role: initial.role ?? "owner",
    listings: initial.listings ?? [aListing()],
    channels: initial.channels ?? [],
    channelListings: initial.channelListings ?? [],
    properties: [aProperty()],
    requests: [],
    failReadsFor: [],
    failWrites: [],
    uploadStatuses: [],
    offline: false,
  };

  const adapter: AxiosAdapter = (config) => {
    const respond: Respond = (data, status = 200) => {
      const response = { data: data === undefined ? data : JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response as AxiosResponse);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const url = config.url ?? "";
    if (url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role, is_demo: false }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const method = (config.method ?? "get").toLowerCase();
    if (method === "get" && server.failReadsFor.some((match) => url.includes(match))) return respond({ detail: "nope" }, 500);
    if (method !== "get") {
      if (server.role === "viewer") return respond({ detail: "nope" }, 403);
      const failing = server.failWrites.find((rule) => url.includes(rule.match));
      if (failing) return respond({ detail: "nope" }, failing.status);
    }
    if (url === "/properties") return respond(server.properties);
    if (url === "/channels") return respond(server.channels);
    if (url.startsWith("/channel-listings/")) return answerChannelListing(server, method, url.split("/")[2], config, respond);
    return answerListing(server, method, url, config, respond);
  };
  api.defaults.adapter = adapter;
  return server;
}

function body(config: AxiosRequestConfig): Record<string, unknown> {
  return config.data && typeof config.data === "string" ? (JSON.parse(config.data) as Record<string, unknown>) : {};
}

function answerListing(server: ListingsServer, method: string, url: string, config: AxiosRequestConfig, respond: Respond) {
  const [, , id, part, subId] = url.split("/");
  if (!id) {
    if (method === "post") {
      const made = aListing({ id: `made${server.listings.length + 1}`, ...(body(config) as Partial<ListingResponse>) });
      server.listings.push(made);
      return respond(made, 201);
    }
    const params = (config.params ?? {}) as { status?: string };
    const items = server.listings.filter((row) => !params.status || row.status === params.status);
    return respond({ items, total: items.length, has_more: false });
  }
  const row = server.listings.find((candidate) => candidate.id === id);
  if (!row) return respond({ detail: "Listing not found" }, 404);
  if (!part) {
    if (method === "delete") {
      server.listings = server.listings.filter((candidate) => candidate !== row);
      return respond(undefined, 204);
    }
    if (method === "put") Object.assign(row, body(config));
    return respond(row);
  }
  if (part === "photos") return answerPhoto(row, method, subId, config, server, respond);
  if (part === "external-ids") return answerLink(row, method, subId, config, respond);
  return answerListingChannels(server, row, method, config, respond);
}

function answerPhoto(row: ListingResponse, method: string, photoId: string | undefined, config: AxiosRequestConfig, server: ListingsServer, respond: Respond) {
  if (method === "post") {
    const parts = formParts(config.data).filter((part) => part.fieldName === "files");
    const rejected = server.uploadStatuses.shift();
    if (rejected) return respond({ detail: "nope" }, rejected);
    const made = parts.map((part, index) => aPhoto(`up-${part.name}-${row.photos.length + index}`, row.photos.length + index));
    row.photos.push(...made);
    return respond(made, 201);
  }
  const photo = row.photos.find((candidate) => candidate.id === photoId);
  if (!photo) return respond({ detail: "Photo not found" }, 404);
  if (method === "delete") {
    row.photos = row.photos.filter((candidate) => candidate !== photo);
    return respond(undefined, 204);
  }
  Object.assign(photo, body(config));
  return respond(photo);
}

function answerLink(row: ListingResponse, method: string, pk: string | undefined, config: AxiosRequestConfig, respond: Respond) {
  const sent = body(config) as Partial<ListingExternalId>;
  if (method === "post") {
    if (row.external_ids.some((link) => link.source === sent.source)) return respond({ detail: "already linked" }, 409);
    const made = aLink(`link${row.external_ids.length + 1}`, sent);
    row.external_ids.push(made);
    return respond(made, 201);
  }
  const link = row.external_ids.find((candidate) => candidate.id === pk);
  if (!link) return respond({ detail: "not found" }, 404);
  if (method === "delete") {
    row.external_ids = row.external_ids.filter((candidate) => candidate !== link);
    return respond(undefined, 204);
  }
  Object.assign(link, sent);
  return respond(link);
}

function answerListingChannels(server: ListingsServer, row: ListingResponse, method: string, config: AxiosRequestConfig, respond: Respond) {
  const mine = server.channelListings.filter((candidate) => candidate.listing_id === row.id);
  if (method === "get") return respond(mine);
  const sent = body(config) as Partial<ChannelListing>;
  if (mine.some((candidate) => candidate.channel_id === sent.channel_id)) return respond({ detail: "already linked" }, 409);
  const channel = server.channels.find((candidate) => candidate.id === sent.channel_id);
  if (!channel) return respond({ detail: "no channel" }, 404);
  const made = aChannelListing(`cl${server.channelListings.length + 1}`, channel, sent);
  server.channelListings.push(made);
  return respond(made, 201);
}

function answerChannelListing(server: ListingsServer, method: string, id: string, config: AxiosRequestConfig, respond: Respond) {
  const row = server.channelListings.find((candidate) => candidate.id === id);
  if (!row) return respond({ detail: "not found" }, 404);
  if (method === "delete") {
    server.channelListings = server.channelListings.filter((candidate) => candidate !== row);
    return respond(undefined, 204);
  }
  Object.assign(row, body(config));
  return respond(row);
}

/** The writes of one kind to URLs containing `match`, in order, with their bodies read. */
export function writesTo(server: ListingsServer, method: "post" | "put" | "patch" | "delete", match = ""): { url: string; body: Record<string, unknown> }[] {
  return server.requests
    .filter((request) => request.method?.toLowerCase() === method && (request.url ?? "").includes(match))
    .map((request) => ({ url: request.url ?? "", body: body(request) }));
}
