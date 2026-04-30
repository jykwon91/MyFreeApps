import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  };
});

import api from "@/lib/api";
import { showError, showSuccess } from "@platform/ui";
import DataExportButton from "@/features/security/DataExportButton";

const mockGet = vi.mocked(api.get);
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowError = vi.mocked(showError);

interface ClickableLink {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

describe("DataExportButton", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let mockLink: ClickableLink;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    // jsdom doesn't implement URL.createObjectURL by default.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = createObjectURL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = revokeObjectURL;

    mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return mockLink as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a button labelled 'Download my data'", () => {
    render(<DataExportButton />);
    expect(screen.getByRole("button", { name: /Download my data/i })).toBeInTheDocument();
  });

  it("downloads the export and shows a success toast on click", async () => {
    mockGet.mockResolvedValue({ data: new Blob(["{}"], { type: "application/json" }) });
    const user = userEvent.setup();
    render(<DataExportButton />);

    await user.click(screen.getByRole("button", { name: /Download my data/i }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        "/users/me/export",
        expect.objectContaining({ responseType: "blob" }),
      );
    });

    await waitFor(() => {
      expect(mockLink.click).toHaveBeenCalled();
    });
    expect(mockLink.download).toMatch(/^myjobhunter-export-.*\.json$/);
    expect(mockLink.href).toBe("blob:fake-url");
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("shows an error toast and skips the download when the API fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<DataExportButton />);

    await user.click(screen.getByRole("button", { name: /Download my data/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockLink.click).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });
});
