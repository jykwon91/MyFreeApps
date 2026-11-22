import { fireEvent, render, screen } from "@testing-library/react-native";
import ApplicantActivity from "../src/features/applicants/ApplicantActivity";

describe("ApplicantActivity", () => {
  it("shows who made each change and the note that came with it", async () => {
    await render(
      <ApplicantActivity
        events={[
          { id: "e1", applicant_id: "a1", event_type: "stage_changed", actor: "host", notes: "Moved after the video call", payload: null, occurred_at: "2026-11-02T12:00:00Z", created_at: "2026-11-02T12:00:00Z" },
          { id: "e2", applicant_id: "a1", event_type: "stage_changed", actor: "system", notes: null, payload: null, occurred_at: "2026-11-03T12:00:00Z", created_at: "2026-11-03T12:00:00Z" },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: /^Activity/ }));
    expect(screen.getByText("By You")).toBeTruthy();
    expect(screen.getByText("Moved after the video call")).toBeTruthy();
    expect(screen.getByText("By System")).toBeTruthy();
  });
});
