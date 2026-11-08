import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AskPanel from "@/games/wow-forever/components/ask/AskPanel";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIMITS, ASK_QUERY_PARAM } from "@/games/wow-forever/data/ask/askLimits";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

function handedOver(params: URLSearchParams): string | null {
  const question = params.get(ASK_QUERY_PARAM)?.trim().slice(0, ASK_LIMITS.questionMaxChars) ?? "";
  return question === "" ? null : question;
}

/**
 * /wow-forever/ask — ask where something is; answers come from the site's own
 * map, item and dungeon data. A question in `?q=` (the hub's ask box) is sent
 * once, and dropped from the URL so a reload or Back doesn't send it again.
 */
export default function WowAskPage() {
  const [params, setParams] = useSearchParams();
  const [initialQuestion] = useState(() => handedOver(params));
  useDocumentTitle(ASK_COPY.documentTitle);

  useEffect(() => {
    if (!params.has(ASK_QUERY_PARAM)) return;
    const next = new URLSearchParams(params);
    next.delete(ASK_QUERY_PARAM);
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <WowPageHeader title={ASK_COPY.title} subtitle={ASK_COPY.subtitle} backTo="/wow-forever" backLabel="Back to WoW Forever" />
      <AskPanel initialQuestion={initialQuestion} />
    </main>
  );
}
