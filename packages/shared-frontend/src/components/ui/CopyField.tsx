import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  label: string;
  value: string;
}

export default function CopyField({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-muted rounded-md px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-mono truncate">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-2 rounded-md hover:bg-background transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check size={16} className="text-green-600" />
        ) : (
          <Copy size={16} className="text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
