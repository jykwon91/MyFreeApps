import { useState, type FormEvent, type RefObject } from "react";
import { LoadingButton } from "@platform/ui";
import { MAX_TURN_CHARS } from "@/features/session/turnLimits";

interface TextFallbackInputProps {
  label: string;
  placeholder: string;
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/** Typed practice: for browsers without speech recognition, or when the mic is off. */
export default function TextFallbackInput({
  label,
  placeholder,
  busy,
  disabled,
  onSend,
  inputRef,
}: TextFallbackInputProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || busy || disabled) return;
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
          disabled={disabled}
          autoComplete="off"
          className="min-h-[44px] flex-1 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <LoadingButton type="submit" isLoading={busy} loadingText="Sending" disabled={disabled || !trimmed}>
          Send
        </LoadingButton>
      </div>
    </form>
  );
}
