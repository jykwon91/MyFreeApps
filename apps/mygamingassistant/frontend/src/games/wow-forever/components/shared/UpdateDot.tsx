import { UPDATE_DOT_LABEL } from "@/games/wow-forever/data/whatsNewSettings";

/** The small "something new here" dot on a hub tile; its meaning is part of the link's name. */
export default function UpdateDot() {
  return (
    <span
      role="img"
      aria-label={UPDATE_DOT_LABEL}
      data-testid="update-dot"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
    />
  );
}
