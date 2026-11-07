import { useState } from "react";
import { Search } from "lucide-react";

export interface SearchBarProps {
  placeholder: string;
  onSearchSubmit?: (q: string) => void;
}

export default function SearchBar({ placeholder, onSearchSubmit }: SearchBarProps) {
  const [value, setValue] = useState("");
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSearchSubmit?.(value);
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden sm:flex items-center">
      <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-14 py-1.5 text-sm rounded-md border bg-background w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <kbd className="absolute right-3 text-xs text-muted-foreground font-mono pointer-events-none">
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </form>
  );
}
