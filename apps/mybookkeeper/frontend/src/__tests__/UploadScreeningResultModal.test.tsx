import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const uploadMock = vi.fn();

vi.mock("@/shared/store/screeningApi", () => ({
  useUploadScreeningResultMutation: () => [uploadMock, { isLoading: false }],
}));

const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (m: string) => showErrorMock(m),
  showSuccess: (m: string) => showSuccessMock(m),
}));

import UploadScreeningResultModal from "@/app/features/screening/UploadScreeningResultModal";

function renderModal(onClose: () => void = vi.fn()) {
  return {
    onClose,
    ...render(
      <Provider store={store}>
        <UploadScreeningResultModal applicantId="app-1" open onClose={onClose} />
      </Provider>,
    ),
  };
}

function makePdfFile(): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], "report.pdf", {
    type: "application/pdf",
  });
}

describe("UploadScreeningResultModal", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
  });

  it("renders the modal with required fields", () => {
    renderModal();
    expect(screen.getByTestId("upload-screening-modal")).toBeInTheDocument();
    expect(screen.getByTestId("upload-screening-file")).toBeInTheDocument();
    expect(screen.getByTestId("upload-screening-status")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-screening-snippet")).not.toBeInTheDocument();
  });

  it("does not show the snippet field for the 'pass' outcome", async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "pass");
    expect(screen.queryByTestId("upload-screening-snippet")).not.toBeInTheDocument();
  });

  it("shows the snippet field when status is 'fail'", async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "fail");
    expect(screen.getByTestId("upload-screening-snippet")).toBeInTheDocument();
  });

  it("shows the snippet field when status is 'inconclusive'", async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "inconclusive");
    expect(screen.getByTestId("upload-screening-snippet")).toBeInTheDocument();
  });

  it("blocks submit when no file is selected", async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "pass");
    await userEvent.click(screen.getByTestId("upload-screening-submit"));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalled();
  });

  it("blocks submit on adverse outcome with no snippet", async () => {
    renderModal();
    const input = screen.getByTestId("upload-screening-file") as HTMLInputElement;
    await userEvent.upload(input, makePdfFile());
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "fail");
    await userEvent.click(screen.getByTestId("upload-screening-submit"));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalled();
  });

  it("submits the correct payload for a 'pass' outcome", async () => {
    uploadMock.mockReturnValue({
      unwrap: () => Promise.resolve({ id: "result-1" }),
    });
    const onClose = vi.fn();
    renderModal(onClose);
    const input = screen.getByTestId("upload-screening-file") as HTMLInputElement;
    const f = makePdfFile();
    await userEvent.upload(input, f);
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "pass");
    await userEvent.click(screen.getByTestId("upload-screening-submit"));
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith({
        applicantId: "app-1",
        file: f,
        status: "pass",
        adverseActionSnippet: null,
      });
      expect(showSuccessMock).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submits the snippet for an adverse outcome", async () => {
    uploadMock.mockReturnValue({
      unwrap: () => Promise.resolve({ id: "result-2" }),
    });
    renderModal();
    const input = screen.getByTestId("upload-screening-file") as HTMLInputElement;
    await userEvent.upload(input, makePdfFile());
    await userEvent.selectOptions(screen.getByTestId("upload-screening-status"), "fail");
    await userEvent.type(
      screen.getByTestId("upload-screening-snippet"),
      "Credit score below threshold",
    );
    await userEvent.click(screen.getByTestId("upload-screening-submit"));
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "fail",
          adverseActionSnippet: "Credit score below threshold",
        }),
      );
    });
  });
});
