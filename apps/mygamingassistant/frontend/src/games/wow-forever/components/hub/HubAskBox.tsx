import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Button } from "@platform/ui";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIMITS, ASK_PAGE_PATH, ASK_QUERY_PARAM } from "@/games/wow-forever/data/ask/askLimits";
import { isHumanCheckedFeatureOffered } from "@/games/wow-forever/lib/humanCheckAvailability";

/** The hub's "Ask" box: a question here opens the Ask page, which sends it. */
export default function HubAskBox() {
  const [text, setText] = useState("");
  const navigate = useNavigate();
  const inputId = useId();
  if (!isHumanCheckedFeatureOffered()) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (question === "") return;
    const params = new URLSearchParams();
    params.set(ASK_QUERY_PARAM, question);
    navigate(`${ASK_PAGE_PATH}?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} role="search" aria-label={ASK_COPY.hubLabel} className="rounded-xl border bg-card p-3 sm:p-4">
      <label htmlFor={inputId} className="mb-2 flex items-center gap-2 text-sm font-medium">
        <MessageCircle className="h-4 w-4" aria-hidden />
        {ASK_COPY.hubLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={ASK_LIMITS.questionMaxChars}
          placeholder={ASK_COPY.hubPlaceholder}
          className="min-h-[44px] min-w-0 flex-1 rounded-md border bg-background px-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={text.trim() === ""}>
          {ASK_COPY.hubSubmit}
        </Button>
      </div>
    </form>
  );
}
