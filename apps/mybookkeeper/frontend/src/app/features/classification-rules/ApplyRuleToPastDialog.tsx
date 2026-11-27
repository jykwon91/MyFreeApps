import { ConfirmDialog } from "@platform/ui";
import { PAYEE_RULE_MESSAGES as MSG } from "@/shared/lib/payee-rule-messages";
import type { ApplyRuleToPast } from "@/shared/types/classification-rule/apply-rule-to-past";

export interface ApplyRuleToPastDialogProps {
  applyToPast: ApplyRuleToPast;
}

export default function ApplyRuleToPastDialog({ applyToPast }: ApplyRuleToPastDialogProps) {
  const { prompt, isApplying, confirm, dismiss } = applyToPast;
  return (
    <ConfirmDialog
      open={prompt !== null}
      title={MSG.pastTitle}
      description={prompt ? MSG.pastDescription(prompt.count, prompt.payee) : ""}
      confirmLabel={prompt ? MSG.pastConfirm(prompt.count) : ""}
      cancelLabel={MSG.pastSkip}
      isLoading={isApplying}
      onConfirm={() => void confirm()}
      onCancel={dismiss}
    />
  );
}
