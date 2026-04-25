import { cn } from "@/shared/utils/cn";

interface Props {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, children, className }: Props) {
  return (
    <div className={cn("bg-card border rounded-lg p-6", className)}>
      {title ? <h2 className="text-base font-medium mb-4">{title}</h2> : null}
      {children}
    </div>
  );
}
