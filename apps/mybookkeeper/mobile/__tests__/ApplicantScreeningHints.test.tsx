import { render, screen } from "@testing-library/react-native";
import ApplicantScreening from "../src/features/applicants/ApplicantScreening";
import { anApplicant } from "../test-support/applicantsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: () => false }));

const applicant = anApplicant({
  screening_results: [{
    id: "s1", applicant_id: "a1", provider: "keycheck", status: "pass", has_report: true, notes: null,
    requested_at: "2026-11-01T12:00:00Z", completed_at: "2026-11-02T12:00:00Z",
    uploaded_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), uploaded_by_user_id: "u1", created_at: "2026-11-02T12:00:00Z",
  }],
});

describe("ApplicantScreening row details", () => {
  it("says when it was uploaded and that the report is under Private details until shown", async () => {
    await render(<ApplicantScreening applicant={applicant} isRevealed={false} />);
    expect(screen.getByText("Uploaded 2 days ago")).toBeTruthy();
    expect(screen.getByText("Report hidden. See Private details.")).toBeTruthy();
  });

  it("drops the hint once the private details are shown", async () => {
    await render(<ApplicantScreening applicant={applicant} isRevealed />);
    expect(screen.queryByText(/Report hidden/)).toBeNull();
  });
});
