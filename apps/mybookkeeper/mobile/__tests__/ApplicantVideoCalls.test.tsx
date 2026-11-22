import { render, screen } from "@testing-library/react-native";
import ApplicantVideoCalls from "../src/features/applicants/ApplicantVideoCalls";

const base = { applicant_id: "a1", created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" };
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe("ApplicantVideoCalls", () => {
  it("tells a finished call from an upcoming one and reads out the rating", async () => {
    await render(
      <ApplicantVideoCalls
        calls={[
          { ...base, id: "c1", scheduled_at: daysAgo(5), completed_at: daysAgo(4), notes: "Friendly, clear plans", gut_rating: 4 },
          { ...base, id: "c2", scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), completed_at: null, notes: null, gut_rating: null },
        ]}
      />,
    );
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.getByText("Completed 4 days ago")).toBeTruthy();
    expect(screen.getByText("Rating 4 of 5")).toBeTruthy();
    expect(screen.getByText("Friendly, clear plans")).toBeTruthy();
    expect(screen.getByText("No notes")).toBeTruthy();
    expect(screen.getAllByText(/^Rating/)).toHaveLength(1);
  });
});
