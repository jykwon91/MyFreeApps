import { useToast } from "@platform/mobile";
import { useState } from "react";
import { WELCOME_MANUAL_ITEM_ACTION } from "../../constants/welcomeManuals";
import type { WelcomeManualItemAction } from "../../types/WelcomeManualItemAction";
import type { WelcomeManualItemMessages } from "../../types/WelcomeManualItemMessages";
import type { WelcomeManualItemWords } from "../../types/WelcomeManualItemWords";
import { useWrite } from "../../lib/useWrite";
import { removeFailure, saveFailure } from "./welcomeManualFailure";

interface Options {
  words: WelcomeManualItemWords;
  isNew: boolean;
  /** False when nothing was changed: saving then just closes. */
  hasChanges: boolean;
  messages: WelcomeManualItemMessages;
  create: () => Promise<unknown>;
  update: () => Promise<unknown>;
  remove: () => Promise<unknown>;
  onDone: () => void;
}

/** The save and delete of one item in a sheet, with the same toasts and failure copy everywhere. */
export function useWelcomeManualItemWrites({ words, isNew, hasChanges, messages, create, update, remove, onDone }: Options) {
  const { showToast } = useToast();
  const write = useWrite();
  const [lastAction, setLastAction] = useState<WelcomeManualItemAction>(WELCOME_MANUAL_ITEM_ACTION.save);

  async function save(): Promise<void> {
    if (!isNew && !hasChanges) {
      onDone();
      return;
    }
    setLastAction(WELCOME_MANUAL_ITEM_ACTION.save);
    const result = await write.run(isNew ? create : update);
    if (result !== "done") return;
    onDone();
    showToast(isNew ? messages.added : messages.saved);
  }

  /** An item someone else already deleted is as good as deleted. */
  async function destroy(): Promise<void> {
    setLastAction(WELCOME_MANUAL_ITEM_ACTION.remove);
    const result = await write.run(remove);
    if (result !== "done" && result !== "gone") return;
    onDone();
    showToast(result === "done" ? messages.deleted : messages.alreadyDeleted);
  }

  const failure = write.error ? (lastAction === WELCOME_MANUAL_ITEM_ACTION.save ? saveFailure(write.error, words, isNew) : removeFailure(write.error, words)) : null;
  return { save, destroy, isBusy: write.isBusy, isSaving: write.isBusy && lastAction === WELCOME_MANUAL_ITEM_ACTION.save, isDeleting: write.isBusy && lastAction === WELCOME_MANUAL_ITEM_ACTION.remove, failure };
}
