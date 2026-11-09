import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualRoomResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-response";
import type { WelcomeManualSectionFieldResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-field-response";
import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";

const WHEN = "2026-01-01T12:00:00Z";

export function aManual(overrides: Partial<WelcomeManualResponse> = {}): WelcomeManualResponse {
  return {
    id: "m1", organization_id: "o1", user_id: "u1", property_id: null, title: "Beach House guide", intro_text: "Welcome to the beach house.",
    rooms: [], sections: [], places: [], share_token: null, share_pin: null, created_at: WHEN, updated_at: WHEN, ...overrides,
  };
}

export function aSection(overrides: Partial<WelcomeManualSectionResponse> = {}): WelcomeManualSectionResponse {
  return { id: "s1", manual_id: "m1", room_id: null, title: "Getting online", body: "Router is in the closet.", display_order: 0, fields: [], images: [], created_at: WHEN, updated_at: WHEN, ...overrides };
}

export function aField(overrides: Partial<WelcomeManualSectionFieldResponse> = {}): WelcomeManualSectionFieldResponse {
  return { id: "f1", section_id: "s1", label: "Wi-Fi network", value: "Lakeview", display_order: 0, created_at: WHEN, ...overrides };
}

export function anImage(overrides: Partial<WelcomeManualSectionImageResponse> = {}): WelcomeManualSectionImageResponse {
  return { id: "i1", section_id: "s1", storage_key: "k/i1.jpg", caption: "The router", display_order: 0, created_at: WHEN, presigned_url: "https://files.example/i1.jpg", is_available: true, ...overrides };
}

export function aRoom(overrides: Partial<WelcomeManualRoomResponse> = {}): WelcomeManualRoomResponse {
  return { id: "r1", manual_id: "m1", name: "Blue room", display_order: 0, created_at: WHEN, updated_at: WHEN, ...overrides };
}

export function aPlace(overrides: Partial<WelcomeManualPlaceResponse> = {}): WelcomeManualPlaceResponse {
  return { id: "pl1", manual_id: "m1", name: "Taco Stand", cuisine: "Mexican", price_tier: "$", note: "Cash only", map_url: "https://maps.example/taco", display_order: 0, created_at: WHEN, ...overrides };
}
