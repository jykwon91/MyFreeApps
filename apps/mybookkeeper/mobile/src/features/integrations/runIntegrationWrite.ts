import type { ToastContextValue } from "@platform/mobile";
import type { useWrite } from "../../lib/useWrite";
import type { WriteFailureCopy } from "../../types/WriteFailureCopy";

/** Runs one server action and tells the person how it went. A second tap while it's in flight does nothing. */
export async function runIntegrationWrite(
  write: ReturnType<typeof useWrite>,
  showToast: ToastContextValue["showToast"],
  copy: WriteFailureCopy,
  action: () => Promise<unknown>,
  success?: () => string,
): Promise<void> {
  const result = await write.run(action);
  if (result === "busy") return;
  if (result === "done") {
    if (success) showToast(success());
    return;
  }
  showToast(copy[result], "error");
}
