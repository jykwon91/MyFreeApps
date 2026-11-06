import { EmptyState } from "@platform/ui";

export default function NoActiveDrop() {
  return (
    <EmptyState
      heading="No drop running right now"
      body="Check back here when the next drop is announced. Orders open once the host activates a drop."
    />
  );
}
