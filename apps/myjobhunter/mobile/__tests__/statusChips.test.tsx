import { EVENT_TYPE_TONES } from "@myjobhunter/api-client/constants/eventTypeTones";
import type { ApplicationEventType } from "@myjobhunter/api-client/types/application-event-type";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import EventCard from "../src/features/applicationDetail/EventCard";
import ApplicationHeader from "../src/features/applicationDetail/ApplicationHeader";
import ApplicationRow from "../src/features/applications/ApplicationRow";
import { applicationRecord } from "../test-support/applicationRecord";
import { eventRecord } from "../test-support/eventRecord";

// The colours the shared Chip paints each tone with in the light theme (see shared-mobile toneColors).
const LIGHT_TONE_BACKGROUND = {
  neutral: "hsl(210, 40%, 96.1%)",
  info: "#dbeafe",
  accent: "#f3e8ff",
  success: "#dcfce7",
  warning: "#fef9c3",
  danger: "#fee2e2",
};

function backgroundOf(label: string): string {
  const chip = screen.getByText(label).parent;
  if (!chip) throw new Error(`No chip around ${label}`);
  return StyleSheet.flatten(chip.props.style).backgroundColor;
}

describe("application row status chip", () => {
  it.each(Object.entries(EVENT_TYPE_TONES))("colours %s by its tone and still says it in words", async (status, tone) => {
    await render(<ApplicationRow application={applicationRecord({ id: "a", latest_status: status })} onPress={jest.fn()} />);

    expect(backgroundOf(formatEventType(status))).toBe(LIGHT_TONE_BACKGROUND[tone]);
  });

  it("shows a status this build doesn't know in the neutral colour", async () => {
    await render(<ApplicationRow application={applicationRecord({ id: "a", latest_status: "phone_screen" })} onPress={jest.fn()} />);

    expect(backgroundOf(formatEventType("phone_screen"))).toBe(LIGHT_TONE_BACKGROUND.neutral);
  });

  it("shows no chip when there is no status", async () => {
    await render(<ApplicationRow application={applicationRecord({ id: "a" })} onPress={jest.fn()} />);

    expect(screen.queryByTestId("chip")).toBeNull();
  });
});

describe("application header chips", () => {
  it.each(KANBAN_COLUMN_ORDER)("shows the %s stage in blue, as the web does", async (column) => {
    await render(<ApplicationHeader application={applicationRecord({ id: "a" })} column={column} companyName="Acme" />);

    expect(backgroundOf(KANBAN_COLUMN_LABELS[column])).toBe(LIGHT_TONE_BACKGROUND.info);
  });

  it("keeps the archived chip grey and the remote chip blue", async () => {
    await render(
      <ApplicationHeader
        application={applicationRecord({ id: "a", archived: true, remote_type: "remote" })}
        column="applied"
        companyName="Acme"
      />,
    );

    expect(backgroundOf("Archived")).toBe(LIGHT_TONE_BACKGROUND.neutral);
    expect(backgroundOf("Remote")).toBe(LIGHT_TONE_BACKGROUND.info);
  });
});

describe("timeline event label", () => {
  it.each<[ApplicationEventType, string]>([
    ["rejected", LIGHT_TONE_BACKGROUND.danger],
    ["offer_received", LIGHT_TONE_BACKGROUND.success],
  ])("colours a %s event by its tone, as the web does", async (eventType, background) => {
    await render(<EventCard event={eventRecord({ id: "e", application_id: "a", event_type: eventType })} onEdit={jest.fn()} />);

    expect(backgroundOf(formatEventType(eventType))).toBe(background);
  });
});
