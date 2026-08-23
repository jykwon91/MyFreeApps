/**
 * Mirrors backend `WelcomeManualRoomResponse` — one lettable room within a
 * by-the-room manual. Rooms hold no content themselves; sections point at them
 * via `room_id`, and a section with `room_id === null` is shared by every room.
 */
export interface WelcomeManualRoomResponse {
  id: string;
  manual_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}
