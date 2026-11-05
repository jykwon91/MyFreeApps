import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";

/** The game-file build and attribution, once for the whole page. */
export default function ClientDataFooter() {
  const state = useClientItems();
  if (state.status !== "ready") return null;
  return (
    <p className="text-xs text-muted-foreground">
      {state.list.attribution} Client build {state.list.clientBuild}.
    </p>
  );
}
