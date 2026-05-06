/**
 * Auto-fill section for AddApplicationDialog.
 *
 * Lets the operator either paste a job-posting URL ("Paste a link" tab,
 * default) or paste the JD text directly ("Paste the description text"
 * tab). Both paths funnel through the parent's `onPrefill` callback,
 * which `setValue`s the application form fields.
 *
 * State machine
 * =============
 * The visible UI is a switch over `mode.kind`:
 *
 *   idle           → collapsed prompt button
 *   fetching/url   → URL input + Fetch button (URL tab)
 *   pasting/text   → JD textarea + Parse button (text tab)
 *   extracting     → URL Fetch in flight (button shows spinner)
 *   parsing        → text Parse in flight (button shows spinner)
 *   parsed         → success banner, fields pre-filled below
 *   failed         → error banner with dismiss
 *   authRequired   → URL was auth-walled — banner with "switch to text" affordance
 *
 * Tab persistence
 * ===============
 * The active tab is held by `tab` state in the parent (so a sibling
 * component re-render doesn't reset it). When the user types into the
 * URL field then switches to the text tab, the URL is preserved in
 * `mode.url`; when they switch back, the URL re-renders. Same for
 * jdText. We do NOT carry the value across tabs (URL → textarea) — they
 * are different inputs.
 *
 * Visible loading feedback
 * ========================
 * Per the project's visible-loading-feedback rule, every async operation
 * here uses a LoadingButton with explicit `isLoading` state. The fetch
 * and parse paths both flip to a spinner immediately on click and
 * disable until the response or error returns.
 */
import { useId } from "react";
import { LoadingButton } from "@platform/ui";
import { Sparkles, ChevronDown, ChevronUp, X, Link as LinkIcon, FileText } from "lucide-react";
import type { JdInputTab, JdParseMode } from "./useJdParseMode";

export interface JdAutoFillSectionProps {
  mode: JdParseMode;
  tab: JdInputTab;
  /** Called when user clicks the collapsed expand button. */
  onExpand: () => void;
  /** Collapse the panel, return to idle state. */
  onCollapse: () => void;
  /** Called when user clicks a tab header. Switches the active input. */
  onSwitchTab: (next: JdInputTab) => void;
  /** Called as the URL input changes. */
  onUrlChange: (url: string) => void;
  /** Called as the JD textarea changes. */
  onTextChange: (text: string) => void;
  /** Called when the user clicks "Fetch" on the URL tab. */
  onFetch: () => void;
  /** Called when the user clicks "Parse with AI" on the text tab. */
  onParse: () => void;
  /** Dismiss success / error banners and return to idle. */
  onDismiss: () => void;
}

export function JdAutoFillSection(props: JdAutoFillSectionProps) {
  const { mode } = props;

  if (mode.kind === "parsed") {
    return <ParsedBanner summary={mode.summary} sourceUrl={mode.sourceUrl} onDismiss={props.onDismiss} />;
  }

  if (mode.kind === "failed") {
    return <FailedBanner errorMessage={mode.errorMessage} onDismiss={props.onDismiss} />;
  }

  if (mode.kind === "authRequired") {
    return (
      <AuthRequiredBanner
        url={mode.url}
        onSwitchToText={() => props.onSwitchTab("text")}
        onDismiss={props.onDismiss}
      />
    );
  }

  if (mode.kind === "idle") {
    return <IdlePrompt onExpand={props.onExpand} />;
  }

  // mode.kind ∈ { fetching, extracting, pasting, parsing }
  return <ActiveInput {...props} />;
}

// ---------------------------------------------------------------------------
// Sub-components — extracted so each renderer stays lean
// ---------------------------------------------------------------------------

interface IdlePromptProps {
  onExpand: () => void;
}

function IdlePrompt({ onExpand }: IdlePromptProps) {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Sparkles size={14} />
        Paste a link or job description to auto-fill
        <ChevronDown size={14} />
      </button>
    </div>
  );
}

interface ParsedBannerProps {
  summary: string | null;
  sourceUrl: string | null;
  onDismiss: () => void;
}

function ParsedBanner({ summary, sourceUrl, onDismiss }: ParsedBannerProps) {
  return (
    <div className="mb-4 rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          Fields pre-filled from JD
        </p>
        {summary ? (
          <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">
            {summary}
          </p>
        ) : null}
        {sourceUrl ? (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            Fetched from <span className="underline">{sourceUrl}</span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-1">
          Review and adjust the fields below before saving.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        aria-label="Dismiss parse result"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface FailedBannerProps {
  errorMessage: string;
  onDismiss: () => void;
}

function FailedBanner({ errorMessage, onDismiss }: FailedBannerProps) {
  return (
    <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-destructive">Couldn't auto-fill</p>
        <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        aria-label="Dismiss error"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface AuthRequiredBannerProps {
  url: string;
  onSwitchToText: () => void;
  onDismiss: () => void;
}

function AuthRequiredBanner({ url, onSwitchToText, onDismiss }: AuthRequiredBannerProps) {
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Couldn't reach this page
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          {humanizeAuthRequired(url)}
        </p>
        <button
          type="button"
          onClick={onSwitchToText}
          className="mt-2 text-xs underline text-amber-900 dark:text-amber-200 hover:text-amber-700"
        >
          Paste the description text instead
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function humanizeAuthRequired(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host} requires sign-in or blocked our request. Paste the description text from the page directly.`;
  } catch {
    return "This page requires sign-in or blocked our request. Paste the description text from the page directly.";
  }
}

// ---------------------------------------------------------------------------
// Active input — tab header + URL or textarea panel
// ---------------------------------------------------------------------------

type ActiveInputProps = JdAutoFillSectionProps;

function ActiveInput(props: ActiveInputProps) {
  const headerId = useId();
  return (
    <div className="mb-4 space-y-3" role="region" aria-labelledby={headerId}>
      <div className="flex items-center justify-between">
        <span id={headerId} className="text-sm font-medium flex items-center gap-1.5">
          <Sparkles size={14} />
          Auto-fill from JD
        </span>
        <button
          type="button"
          onClick={props.onCollapse}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Collapse auto-fill panel"
        >
          <ChevronUp size={14} />
        </button>
      </div>

      <TabSelector active={props.tab} onSwitch={props.onSwitchTab} />

      {props.tab === "url" ? (
        <UrlInputPanel {...props} />
      ) : (
        <TextInputPanel {...props} />
      )}
    </div>
  );
}

interface TabSelectorProps {
  active: JdInputTab;
  onSwitch: (next: JdInputTab) => void;
}

function TabSelector({ active, onSwitch }: TabSelectorProps) {
  return (
    <div role="tablist" aria-label="JD input method" className="grid grid-cols-2 gap-2">
      <TabButton
        active={active === "url"}
        onClick={() => onSwitch("url")}
        icon={<LinkIcon size={14} />}
        label="Paste a link"
        controls="jd-url-panel"
      />
      <TabButton
        active={active === "text"}
        onClick={() => onSwitch("text")}
        icon={<FileText size={14} />}
        label="Paste the description"
        controls="jd-text-panel"
      />
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  controls: string;
}

function TabButton({ active, onClick, icon, label, controls }: TabButtonProps) {
  // Tailwind class composition kept flat — no nested ternaries.
  const baseClass =
    "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md border min-h-[40px] transition-colors";
  const activeClass = "bg-primary text-primary-foreground border-primary";
  const inactiveClass = "bg-background text-foreground border-input hover:bg-muted";
  const className = active ? `${baseClass} ${activeClass}` : `${baseClass} ${inactiveClass}`;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={className}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UrlInputPanel(props: ActiveInputProps) {
  const { mode } = props;
  const url = mode.kind === "fetching" ? mode.url : mode.kind === "extracting" ? mode.url : "";
  const isExtracting = mode.kind === "extracting";
  const canFetch = url.trim().length > 0 && !isExtracting;
  const inputId = useId();

  return (
    <div id="jd-url-panel" role="tabpanel" className="space-y-2">
      <label htmlFor={inputId} className="block text-xs text-muted-foreground">
        Job posting URL
      </label>
      <input
        id={inputId}
        type="url"
        value={url}
        onChange={(e) => props.onUrlChange(e.target.value)}
        placeholder="https://jobs.example.com/posting/abc"
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        disabled={isExtracting}
        aria-label="Job posting URL"
        autoFocus
      />
      <LoadingButton
        type="button"
        isLoading={isExtracting}
        loadingText="Fetching…"
        disabled={!canFetch}
        onClick={props.onFetch}
      >
        Fetch and auto-fill
      </LoadingButton>
      <p className="text-xs text-muted-foreground">
        Works for most career pages. LinkedIn and Glassdoor require sign-in — for those,
        paste the description text instead.
      </p>
    </div>
  );
}

function TextInputPanel(props: ActiveInputProps) {
  const { mode } = props;
  const jdText =
    mode.kind === "pasting" ? mode.jdText : mode.kind === "parsing" ? mode.jdText : "";
  const isParsing = mode.kind === "parsing";
  const canParse = jdText.trim().length > 0 && !isParsing;

  return (
    <div id="jd-text-panel" role="tabpanel" className="space-y-2">
      <textarea
        value={jdText}
        onChange={(e) => props.onTextChange(e.target.value)}
        rows={6}
        placeholder="Paste the full job description here…"
        className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y"
        disabled={isParsing}
        aria-label="Job description text"
        autoFocus
      />
      <LoadingButton
        type="button"
        isLoading={isParsing}
        loadingText="Parsing…"
        disabled={!canParse}
        onClick={props.onParse}
      >
        Parse with AI
      </LoadingButton>
    </div>
  );
}
