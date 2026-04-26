import { useCallback, useEffect, useState } from "react";
import * as Toast from "@radix-ui/react-toast";
import { XCircle, CheckCircle2, X } from "lucide-react";
import { subscribe } from "@/shared/lib/toast-store";
import type { ToastEvent } from "@/shared/lib/toast-store";

const DURATION_MS = 6000;

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return subscribe((toast) => {
      setToasts((prev) => [...prev, toast]);
    });
  }, []);

  const handleOpenChange = useCallback((open: boolean, id: string) => {
    if (!open) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }, []);

  return (
    <Toast.Provider duration={DURATION_MS}>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          open
          onOpenChange={(open: boolean) => handleOpenChange(open, toast.id)}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm ${
            toast.variant === "error"
              ? "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
              : "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
          }`}
        >
          {toast.variant === "error" ? (
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          )}
          <Toast.Description className="flex-1">
            {toast.message}
          </Toast.Description>
          <Toast.Close className="shrink-0 text-current opacity-50 hover:opacity-100">
            <X className="h-4 w-4" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport
        className="fixed top-4 right-4 left-4 z-50 space-y-2 max-w-md sm:left-auto sm:w-[390px] outline-none pointer-events-none [&>*]:pointer-events-auto"
        label="Notifications"
      />
    </Toast.Provider>
  );
}
