import type { CompanyFieldProps } from "@/types/company/company-field-props";

/** One labelled fact in the company page's details grid. */
export default function CompanyField({ label, value }: CompanyFieldProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
