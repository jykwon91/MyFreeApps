import { type ReactNode } from "react";

export interface CenteredCardProps {
  title: string;
  children: ReactNode;
}

export function CenteredCard({ title, children }: CenteredCardProps) {
  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
