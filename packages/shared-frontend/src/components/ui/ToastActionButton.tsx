import { useState } from "react";
import type { MouseEvent } from "react";
import * as Toast from "@radix-ui/react-toast";
import type { ToastActionButtonProps } from "./ToastActionButtonProps";

export default function ToastActionButton({ action, onDone }: ToastActionButtonProps) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    // Radix closes the toast on click unless the default is prevented. Keep it
    // open while the action runs so the button can show it is busy.
    event.preventDefault();
    setIsPending(true);
    try {
      await action.onClick();
    } catch (error) {
      // The caller owns the user-facing error (see ToastAction); this only keeps
      // its bug visible instead of an unhandled rejection.
      console.error("[Toaster] toast action failed", error);
    } finally {
      onDone();
    }
  }

  return (
    <Toast.Action
      altText={action.altText}
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      className="shrink-0 self-center min-h-[44px] sm:min-h-0 px-2 font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50"
    >
      {isPending ? (action.pendingLabel ?? action.label) : action.label}
    </Toast.Action>
  );
}
