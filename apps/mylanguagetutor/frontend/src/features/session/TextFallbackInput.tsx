import { useState, type FormEvent, type RefObject } from "react";
import { LoadingButton } from "@platform/ui";
import { MAX_TURN_CHARS } from "@mylanguagetutor/api-client/constants/turnLimits";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

interface TextFallbackInputProps {
  label: string;
  placeholder: string;
  busy: boolean;
  onSend: (text: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Typed practice: for browsers without speech recognition, or when the mic is off. The field stays
 * editable (and focused) while a reply streams, so the learner keeps typing; only sending waits.
 */
export default function TextFallbackInput({
  label,
  placeholder,
  busy,
  onSend,
  inputRef,
}: TextFallbackInputProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor="practice-text" className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="practice-text"
          ref={inputRef}
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_TURN_CHARS}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-[44px] flex-1 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <LoadingButton type="submit" isLoading={busy} loadingText={PRACTICE_COPY.sending} disabled={!trimmed}>
          {PRACTICE_COPY.send}
        </LoadingButton>
      </div>
    </form>
  );
}
