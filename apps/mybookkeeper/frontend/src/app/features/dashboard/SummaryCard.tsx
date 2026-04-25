import { formatCurrency } from "@/shared/utils/currency";
import Card from "@/shared/components/ui/Card";

interface Props {
  label: string;
  amount: number;
  color: string;
}

export default function SummaryCard({ label, amount, color }: Props) {
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${color}`}>{formatCurrency(amount)}</p>
    </Card>
  );
}
