import { SHARED_ROOM_OPTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualRoomResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-response";
import type { SheetOption } from "@platform/mobile";
import { WELCOME_MANUAL_EMAIL_MESSAGES, WELCOME_MANUAL_SECTION_MESSAGES } from "../../constants/welcomeManualForms";

/** "Every room" first, then one choice per room. The shared choice is a stand-in for no room at all. */
export function roomScopeOptions(rooms: readonly WelcomeManualRoomResponse[]): SheetOption<string>[] {
  return [{ value: SHARED_ROOM_OPTION, label: WELCOME_MANUAL_SECTION_MESSAGES.everyone }, ...rooms.map((room) => ({ value: room.id, label: room.name }))];
}

export function roomNameFor(rooms: readonly WelcomeManualRoomResponse[], roomId: string | null): string | null {
  return roomId === null ? null : (rooms.find((room) => room.id === roomId)?.name ?? null);
}

/** For the email: a room's guide, or the shared sections alone when the guest isn't in any room. */
export function emailRoomOptions(rooms: readonly WelcomeManualRoomResponse[]): SheetOption<string>[] {
  return [{ value: SHARED_ROOM_OPTION, label: WELCOME_MANUAL_EMAIL_MESSAGES.sharedOnly }, ...rooms.map((room) => ({ value: room.id, label: room.name }))];
}
