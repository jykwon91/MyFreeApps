import type { Company } from "@myjobhunter/api-client/types/company";
import CompanyAvatar from "./CompanyAvatar";

interface CompanyRowProps {
  id: string;
  company: Company;
  highlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

export default function CompanyRow({ id, company, highlighted, onClick, onMouseEnter }: CompanyRowProps) {
  const baseClass = "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm";
  const stateClass = highlighted ? "bg-muted" : "hover:bg-muted/60";
  return (
    <li
      id={id}
      role="option"
      aria-selected={highlighted}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`${baseClass} ${stateClass}`}
    >
      <CompanyAvatar logoUrl={company.logo_url} name={company.name} />
      <span className="flex-1 truncate">{company.name}</span>
      {company.primary_domain ? (
        <span className="text-xs text-muted-foreground truncate">{company.primary_domain}</span>
      ) : null}
    </li>
  );
}
