import { WELCOME_MANUAL_MAX_PLACES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import { useState } from "react";
import { WELCOME_MANUAL_PLACE_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualItemList from "./WelcomeManualItemList";
import WelcomeManualItemRow from "./WelcomeManualItemRow";
import WelcomeManualLoader from "./WelcomeManualLoader";
import { placeLine } from "./welcomeManualDisplay";
import WelcomeManualPlaceSheet from "./WelcomeManualPlaceSheet";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";
import type { WelcomeManualEditing } from "../../types/WelcomeManualEditing";

export default function WelcomeManualPlacesScreen({ manualId }: WelcomeManualScreenProps) {
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<WelcomeManualEditing<WelcomeManualPlaceResponse>>(null);
  return (
    <WelcomeManualLoader id={manualId}>
      {({ manual, refreshControl }) => (
        <>
          <WelcomeManualItemList
            addLabel={MESSAGES.add}
            atLimit={MESSAGES.atLimit}
            canAdd={manual.places.length < WELCOME_MANUAL_MAX_PLACES}
            emptyBody={MESSAGES.noneBody}
            emptyHeading={MESSAGES.none}
            items={manual.places}
            keyOf={(place) => place.id}
            onAdd={() => setEditing("new")}
            refreshControl={refreshControl}
            renderItem={(place) => (
              <WelcomeManualItemRow accessibilityLabel={`${place.name}, ${placeLine(place)}`} onPress={canWrite ? () => setEditing(place) : undefined} subtitle={placeLine(place)} title={place.name} />
            )}
            testID="welcome-manual-places-list"
          />
          {editing ? <WelcomeManualPlaceSheet manualId={manualId} onClose={() => setEditing(null)} places={manual.places} place={editing === "new" ? null : editing} /> : null}
        </>
      )}
    </WelcomeManualLoader>
  );
}
