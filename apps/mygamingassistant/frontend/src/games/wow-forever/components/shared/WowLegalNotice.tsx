import { WOW_LEGAL_NOTICE } from "@/games/wow-forever/data/legalNotice";

/** The trademark / art notice — mounted once, in the shared WoW Forever page footer (`routes.tsx`). */
export default function WowLegalNotice() {
  return (
    <p className="max-w-4xl px-4 pb-6 text-xs text-muted-foreground sm:px-8" data-testid="wow-legal-notice">
      {WOW_LEGAL_NOTICE}
    </p>
  );
}
