import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FlaskConical, Upload, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@platform/ui";
import {
  DEMO_WELCOME_DESCRIPTION,
  DEMO_WELCOME_DISMISS,
  DEMO_WELCOME_EDIT,
  DEMO_WELCOME_FEATURES,
  DEMO_WELCOME_TITLE,
  DEMO_WELCOME_UPLOAD,
} from "@mybookkeeper/api-client/constants/demoWelcome";
import { useCurrentOrg } from "@/shared/hooks/useCurrentOrg";

const STORAGE_KEY = "demo-welcome-dismissed";

export default function DemoWelcomeDialog() {
  const org = useCurrentOrg();
  const [open, setOpen] = useState(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") return false;
    return true;
  });

  if (!org?.is_demo) return null;
  if (!open) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleDismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical size={20} className="text-primary" />
            {DEMO_WELCOME_TITLE}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-2">
            {DEMO_WELCOME_DESCRIPTION}
          </Dialog.Description>

          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3 text-sm">
              <Upload size={16} className="text-primary mt-0.5 shrink-0" />
              <span>{DEMO_WELCOME_UPLOAD}</span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <Settings size={16} className="text-primary mt-0.5 shrink-0" />
              <span>{DEMO_WELCOME_FEATURES}</span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
              <span>{DEMO_WELCOME_EDIT}</span>
            </li>
          </ul>

          <div className="flex justify-end mt-6">
            <Button size="sm" onClick={handleDismiss}>
              {DEMO_WELCOME_DISMISS}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
