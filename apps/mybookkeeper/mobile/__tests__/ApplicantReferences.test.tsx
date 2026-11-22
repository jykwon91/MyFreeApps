import { render, screen } from "@testing-library/react-native";
import ApplicantReferences from "../src/features/applicants/ApplicantReferences";

const base = {
  applicant_id: "a1", created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z",
};

describe("ApplicantReferences", () => {
  it("names the relationship in words and says whether they were contacted", async () => {
    await render(
      <ApplicantReferences
        references={[
          { ...base, id: "r1", relationship: "landlord", reference_name: "Pat Lee", notes: "Said they paid on time", contacted_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
          { ...base, id: "r2", relationship: "employer", reference_name: "Kim Ode", notes: null, contacted_at: null },
        ]}
      />,
    );
    expect(screen.getByText("Pat Lee")).toBeTruthy();
    expect(screen.getByText("Previous landlord · Contacted 3 days ago")).toBeTruthy();
    expect(screen.getByText("Said they paid on time")).toBeTruthy();
    expect(screen.getByText("Employer · Not contacted yet")).toBeTruthy();
    expect(screen.queryByText(/^landlord/)).toBeNull();
  });

  it("shows an unknown relationship as it came", async () => {
    await render(<ApplicantReferences references={[{ ...base, id: "r1", relationship: "neighbor", reference_name: "Al", notes: null, contacted_at: null }]} />);
    expect(screen.getByText("neighbor · Not contacted yet")).toBeTruthy();
  });
});
