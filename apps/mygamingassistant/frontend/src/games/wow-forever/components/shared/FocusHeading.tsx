import { useEffect, useRef, type ReactNode } from "react";

interface FocusHeadingProps {
  children: ReactNode;
  className?: string;
}

/**
 * An h2 that takes keyboard / screen-reader focus when it appears — for a result or problem that
 * replaces what the player was just using, so they land on it instead of back at the top of the page.
 */
export default function FocusHeading({ children, className }: FocusHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className={className ?? "text-lg font-semibold focus:outline-none"}>
      {children}
    </h2>
  );
}
