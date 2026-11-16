import type { ReactNode } from "react";

export interface CenteredCardProps {
  /** The card's heading, rendered as the page's h1. */
  title: string;
  children: ReactNode;
}
