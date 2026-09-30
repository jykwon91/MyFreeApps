import { useEffect, useState } from "react";

const SETTLE_MS = 600;

/** Announces the new best pick to screen readers once typing settles. */
export default function FoodResultStatus({ message }: { message: string }) {
  const [announced, setAnnounced] = useState(message);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(message), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <p role="status" className="sr-only">
      {announced}
    </p>
  );
}
