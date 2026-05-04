import { DollarSign } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";

export interface TenantPaymentsHeaderProps {
  total: number;
}

export default function TenantPaymentsHeader({ total }: TenantPaymentsHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <DollarSign className="h-4 w-4 text-green-600" aria-hidden="true" />
      <span className="text-sm font-medium text-green-600">
        Total received: {formatCurrency(total)}
      </span>
    </div>
  );
}
