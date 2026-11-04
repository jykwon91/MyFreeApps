import {
  useDeleteInquiryMutation,
  useMarkInquiryNotSpamMutation,
  useMarkInquirySpamMutation,
  useUpdateInquiryMutation,
} from "@mybookkeeper/api-client/store/inquiriesApi";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { stageLabel } from "./inquiryDisplay";
import { inquiryWriteFailure } from "./inquiryFailures";

export function useInquiryActions(id: string) {
  const { showToast } = useToast();
  const [updateInquiry, { isLoading: isUpdating }] = useUpdateInquiryMutation();
  const [deleteInquiry, { isLoading: isArchiving }] = useDeleteInquiryMutation();
  const [markSpam, { isLoading: isMarkingSpam }] = useMarkInquirySpamMutation();
  const [markNotSpam, { isLoading: isMarkingNotSpam }] = useMarkInquiryNotSpamMutation();

  const [hasArchived, setHasArchived] = useState(false);
  const isRunning = useRef(false);

  async function run(work: () => Promise<unknown>, success: string, failure: string): Promise<boolean> {
    // The spam banner and an Alert can both fire while something else is under way.
    if (isRunning.current) return false;
    isRunning.current = true;
    try {
      await work();
      showToast(success);
      return true;
    } catch (error) {
      showToast(inquiryWriteFailure(error, failure), "error");
      return false;
    } finally {
      isRunning.current = false;
    }
  }

  function moveToStage(stage: InquiryStage): Promise<boolean> {
    return run(
      () => updateInquiry({ id, data: { stage } }).unwrap(),
      `Moved to ${stageLabel(stage)}.`,
      "I couldn't update that stage. Want to try again?",
    );
  }

  return {
    hasArchived,
    isBusy: isUpdating || isArchiving || isMarkingSpam || isMarkingNotSpam,
    isUpdating,
    moveToStage,
    markSpam: () => run(() => markSpam(id).unwrap(), "Marked as spam.", "I couldn't mark that as spam. Want to try again?"),
    markNotSpam: () => run(() => markNotSpam(id).unwrap(), "Marked as not spam.", "I couldn't change that. Want to try again?"),
    confirmDecline: () =>
      Alert.alert("Decline this inquiry?", "It moves to Declined. You can move it back later.", [
        { text: "Cancel", style: "cancel" },
        { text: "Decline", style: "destructive", onPress: () => void moveToStage("declined") },
      ]),
    confirmArchive: () =>
      Alert.alert("Archive this inquiry?", "It leaves every list, and you can't bring it back. Its history is kept.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            if (await run(() => deleteInquiry(id).unwrap(), "Archived.", "I couldn't archive that. Want to try again?")) setHasArchived(true);
          },
        },
      ]),
  };
}
