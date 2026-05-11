/**
 * Form section for Greenhouse saved-search config.
 *
 * The operator supplies a single field: board_token — the slug from the
 * Greenhouse board URL: boards.greenhouse.io/<board_token>.
 *
 * Client-side validation mirrors the backend regex:
 * ``^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$``
 */

const BOARD_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

interface GreenhouseConfigSectionProps {
  boardToken: string;
  onBoardTokenChange: (value: string) => void;
}

export default function GreenhouseConfigSection({
  boardToken,
  onBoardTokenChange,
}: GreenhouseConfigSectionProps) {
  const isInvalid = boardToken.length > 0 && !BOARD_TOKEN_RE.test(boardToken);

  return (
    <div className="space-y-2">
      <label
        htmlFor="greenhouse-board-token"
        className="block text-sm font-medium"
      >
        Greenhouse board token
      </label>
      <input
        id="greenhouse-board-token"
        type="text"
        className={`w-full rounded border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
          isInvalid ? "border-destructive" : "border-border"
        }`}
        placeholder="e.g. stripe"
        value={boardToken}
        onChange={(e) => onBoardTokenChange(e.target.value.trim())}
        aria-describedby="greenhouse-board-token-hint"
        aria-invalid={isInvalid}
        autoComplete="off"
        spellCheck={false}
      />
      <p
        id="greenhouse-board-token-hint"
        className={`text-xs ${isInvalid ? "text-destructive" : "text-muted-foreground"}`}
      >
        {isInvalid
          ? "Invalid token — use letters, digits, hyphens, and underscores only."
          : "Find this in the Greenhouse board URL: boards.greenhouse.io/​<board_token>"}
      </p>
    </div>
  );
}
