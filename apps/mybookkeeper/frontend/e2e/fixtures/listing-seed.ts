import type { APIRequestContext } from "@playwright/test";
import type { CreatedListing } from "./created-listing";

/** An active listing, so its public apply page at /apply/:slug is live. */
export async function createListing(
  api: APIRequestContext,
  payload: {
    property_id: string;
    title: string;
    monthly_rate: string;
    description?: string;
  },
): Promise<CreatedListing> {
  const res = await api.post("/listings", {
    data: {
      room_type: "private_room",
      status: "active",
      private_bath: false,
      parking_assigned: false,
      furnished: false,
      pets_on_premises: false,
      ...payload,
    },
  });
  if (!res.ok()) {
    throw new Error(`createListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as CreatedListing;
  return { id: body.id, slug: body.slug };
}
