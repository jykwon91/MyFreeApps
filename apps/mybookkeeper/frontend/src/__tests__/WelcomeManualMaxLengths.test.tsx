/**
 * Every welcome-manual text input on the web caps its length at the same value
 * the backend request schemas enforce (shared via welcomeManualLimits), so
 * over-length input is stopped at the keyboard instead of failing the save.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { ReactElement } from "react";
import WelcomeManualCreateDialog from "@/app/features/welcome-manuals/WelcomeManualCreateDialog";
import WelcomeManualEmailDialog from "@/app/features/welcome-manuals/WelcomeManualEmailDialog";
import WelcomeManualForm from "@/app/features/welcome-manuals/WelcomeManualForm";
import WelcomeManualPlaceCard from "@/app/features/welcome-manuals/WelcomeManualPlaceCard";
import WelcomeManualRoomManager from "@/app/features/welcome-manuals/WelcomeManualRoomManager";
import WelcomeManualSectionCard from "@/app/features/welcome-manuals/WelcomeManualSectionCard";
import WelcomeManualSectionFieldCard from "@/app/features/welcome-manuals/WelcomeManualSectionFieldCard";
import WelcomeManualSectionImageCard from "@/app/features/welcome-manuals/WelcomeManualSectionImageCard";
import {
  WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH,
  WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH,
  WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH,
  WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH,
  WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH,
  WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH,
  WELCOME_MANUAL_TITLE_MAX_LENGTH,
} from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const idleMutation = vi.hoisted(() => () => [() => undefined, { isLoading: false }]);

vi.mock("@mybookkeeper/api-client/store/welcomeManualsApi", () => ({
  useCreateWelcomeManualMutation: idleMutation,
  useUpdateWelcomeManualMutation: idleMutation,
  useEmailWelcomeManualMutation: idleMutation,
  useCreateRoomMutation: idleMutation,
  useUpdateRoomMutation: idleMutation,
  useDeleteRoomMutation: idleMutation,
  useUpdateSectionMutation: idleMutation,
  useDeleteSectionMutation: idleMutation,
  useUploadSectionImagesMutation: idleMutation,
  useUpdateSectionImageMutation: idleMutation,
  useDeleteSectionImageMutation: idleMutation,
  useReorderSectionImagesMutation: idleMutation,
  useCreateSectionFieldMutation: idleMutation,
  useUpdateSectionFieldMutation: idleMutation,
  useDeleteSectionFieldMutation: idleMutation,
  useReorderSectionFieldsMutation: idleMutation,
}));

const TIMESTAMP = "2026-01-01T00:00:00Z";

const SECTION: WelcomeManualSectionResponse = {
  id: "sec-1",
  manual_id: "m-1",
  room_id: null,
  title: "Wi-Fi",
  body: "Network",
  display_order: 0,
  fields: [],
  images: [],
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

const MANUAL: WelcomeManualResponse = {
  id: "m-1",
  organization_id: "org-1",
  user_id: "user-1",
  property_id: null,
  title: "Guide",
  intro_text: null,
  rooms: [],
  sections: [],
  places: [],
  share_token: null,
  share_pin: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

function withDnd(node: ReactElement, ids: string[]): ReactElement {
  return (
    <DndContext>
      <SortableContext items={ids}>{node}</SortableContext>
    </DndContext>
  );
}

function expectMax(testId: string, max: number): void {
  expect(screen.getByTestId(testId)).toHaveAttribute("maxlength", String(max));
}

describe("welcome-manual web inputs cap length like the backend", () => {
  it("create dialog title", () => {
    render(<WelcomeManualCreateDialog properties={[]} onClose={vi.fn()} onCreated={vi.fn()} />);
    expectMax("welcome-manual-create-title", WELCOME_MANUAL_TITLE_MAX_LENGTH);
  });

  it("edit form title", () => {
    render(<WelcomeManualForm manual={MANUAL} properties={[]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expectMax("welcome-manual-edit-title", WELCOME_MANUAL_TITLE_MAX_LENGTH);
  });

  it("section title", () => {
    render(withDnd(<WelcomeManualSectionCard manualId="m-1" section={SECTION} rooms={[]} />, ["sec-1"]));
    expectMax("welcome-manual-section-title", WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH);
  });

  it("room name", () => {
    render(
      <WelcomeManualRoomManager
        manualId="m-1"
        rooms={[{ id: "r-1", manual_id: "m-1", name: "Front", display_order: 0, created_at: TIMESTAMP, updated_at: TIMESTAMP }]}
        sectionCountByRoom={new Map()}
      />,
    );
    expectMax("welcome-manual-room-name", WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH);
  });

  it("field label and value", () => {
    render(
      withDnd(
        <WelcomeManualSectionFieldCard
          field={{ id: "f-1", section_id: "sec-1", label: "Wi-Fi", value: "x", display_order: 0, created_at: TIMESTAMP }}
          onDelete={vi.fn()}
          onLabelSave={vi.fn()}
          onValueSave={vi.fn()}
        />,
        ["f-1"],
      ),
    );
    expectMax("welcome-manual-field-label", WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH);
    expectMax("welcome-manual-field-value", WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH);
  });

  it("photo caption", () => {
    render(
      withDnd(
        <WelcomeManualSectionImageCard
          image={{ id: "i-1", section_id: "sec-1", storage_key: "k", caption: null, display_order: 0, created_at: TIMESTAMP }}
          onDelete={vi.fn()}
          onOpen={vi.fn()}
          onCaptionSave={vi.fn()}
        />,
        ["i-1"],
      ),
    );
    expectMax("welcome-manual-image-caption", WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH);
  });

  it("place name, cuisine, note and map link", () => {
    render(
      <WelcomeManualPlaceCard
        place={{ id: "p-1", manual_id: "m-1", name: "Taco", cuisine: "Mexican", price_tier: null, note: null, map_url: null, display_order: 0, created_at: TIMESTAMP }}
        cuisineOptions={[]}
        onDelete={vi.fn()}
        onNameSave={vi.fn()}
        onCuisineSave={vi.fn()}
        onPriceTierChange={vi.fn()}
        onNoteSave={vi.fn()}
        onMapUrlSave={vi.fn()}
      />,
    );
    expectMax("welcome-manual-place-name", WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH);
    expectMax("welcome-manual-place-cuisine", WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH);
    expectMax("welcome-manual-place-note", WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH);
    expectMax("welcome-manual-place-map-url", WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH);
  });

  it("email dialog guest name", () => {
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={vi.fn()} />);
    expectMax("welcome-manual-email-name", WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH);
  });
});
