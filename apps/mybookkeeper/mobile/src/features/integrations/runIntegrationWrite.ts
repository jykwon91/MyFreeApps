import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import type { ToastContextValue } from "@platform/mobile";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
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
  let wasDemoRefusal = false;
  const result = await write.run(async () => {
    try {
      await action();
    } catch (error) {
      wasDemoRefusal = isDemoRefusal(error);
      throw error;
    }
  });
  if (result === "busy") return;
  if (result === "done") {
    if (success) showToast(success());
    return;
  }
  // A demo account is refused with the same status as a viewer, but the fix is different.
  showToast(result === "viewOnly" && wasDemoRefusal ? MESSAGES.demoRefused : copy[result], "error");
}
