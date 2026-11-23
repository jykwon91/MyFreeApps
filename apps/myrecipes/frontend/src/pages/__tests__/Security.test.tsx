import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ACCOUNT_COPY } from "@myrecipes/api-client/constants/accountCopy";
import Security from "@/pages/Security";

vi.mock("@platform/ui/components/auth/TwoFactorSetup", () => ({ default: () => null }));
vi.mock("@platform/ui/components/auth/SignedInDevices", () => ({ default: () => null }));
vi.mock("@platform/ui/components/auth/DisplayNameSetting", () => ({ default: () => null }));
vi.mock("@/features/security/DataExportButton", () => ({ default: () => null }));
vi.mock("@/features/security/DeleteAccountModal", () => ({ default: () => null }));

describe("Security page copy", () => {
  it("uses the shared account copy for the intro, export and delete text", () => {
    render(<Security />);
    expect(screen.getByText(ACCOUNT_COPY.twoFactorIntro)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_COPY.exportDescription)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_COPY.deleteWarning)).toBeInTheDocument();
    expect(screen.queryByText(/all associated data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/we recommend/i)).not.toBeInTheDocument();
  });
});
