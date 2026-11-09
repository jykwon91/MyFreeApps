import { WELCOME_MANUAL_MAX_ROOMS } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualRoomResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-response";
import { useState } from "react";
import { WELCOME_MANUAL_ROOM_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualItemList from "./WelcomeManualItemList";
import WelcomeManualItemRow from "./WelcomeManualItemRow";
import WelcomeManualLoader from "./WelcomeManualLoader";
import WelcomeManualRoomSheet from "./WelcomeManualRoomSheet";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";
import type { WelcomeManualEditing } from "../../types/WelcomeManualEditing";

export default function WelcomeManualRoomsScreen({ manualId }: WelcomeManualScreenProps) {
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<WelcomeManualEditing<WelcomeManualRoomResponse>>(null);
  return (
    <WelcomeManualLoader id={manualId}>
      {({ manual, refreshControl }) => (
        <>
          <WelcomeManualItemList
            addLabel={MESSAGES.add}
            atLimit={MESSAGES.atLimit}
            canAdd={manual.rooms.length < WELCOME_MANUAL_MAX_ROOMS}
            emptyBody={MESSAGES.hint}
            emptyHeading={MESSAGES.none}
            hint={manual.rooms.length > 0 ? MESSAGES.hint : undefined}
            items={manual.rooms}
            keyOf={(room) => room.id}
            onAdd={() => setEditing("new")}
            refreshControl={refreshControl}
            renderItem={(room) => (
              <WelcomeManualItemRow
                accessibilityLabel={room.name}
                onPress={canWrite ? () => setEditing(room) : undefined}
                subtitle={MESSAGES.sectionCount(manual.sections.filter((section) => section.room_id === room.id).length)}
                title={room.name}
              />
            )}
            testID="welcome-manual-rooms-list"
          />
          {editing ? <WelcomeManualRoomSheet manualId={manualId} onClose={() => setEditing(null)} room={editing === "new" ? null : editing} /> : null}
        </>
      )}
    </WelcomeManualLoader>
  );
}
