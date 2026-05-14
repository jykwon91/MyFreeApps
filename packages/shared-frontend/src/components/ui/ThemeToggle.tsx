import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";

const OPTIONS = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "System" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border p-0.5"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          className={`p-1.5 rounded transition-colors ${
            theme === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
