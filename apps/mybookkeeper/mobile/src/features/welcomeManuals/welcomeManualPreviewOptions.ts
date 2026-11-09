import { SHARED_ROOM_OPTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualRoomResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-response";
import type { SheetOption } from "@platform/mobile";
import { WELCOME_MANUAL_PREVIEW_MESSAGES, roomScopeLabel } from "../../constants/welcomeManualForms";

/** What can be previewed: the shared link, or the guide emailed for one room. */
export function previewScopeOptions(rooms: readonly WelcomeManualRoomResponse[]): SheetOption<string>[] {
  return [{ value: SHARED_ROOM_OPTION, label: WELCOME_MANUAL_PREVIEW_MESSAGES.sharedLink }, ...rooms.map((room) => ({ value: room.id, label: roomScopeLabel(room.name) }))];
}
