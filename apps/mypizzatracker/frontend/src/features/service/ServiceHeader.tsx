import type { ServiceHeaderProps } from "@/types/service/ServiceHeaderProps";

export default function ServiceHeader({ title, subtitle, actions }: ServiceHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="space-y-1">
        <div className="flex items-center gap-2">{title}</div>
        {subtitle}
      </div>
      {actions}
    </header>
  );
}
