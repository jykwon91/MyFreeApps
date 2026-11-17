import { Link } from "react-router-dom";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";

export interface RentalRoiUnassignedNoteProps {
  cents: number;
}

export default function RentalRoiUnassignedNote({ cents }: RentalRoiUnassignedNoteProps) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="rental-roi-unassigned">
      {formatMoneyCents(cents)}/mo of revenue isn't tied to a property.{" "}
      <Link to="/transactions" className="inline-flex min-h-[44px] items-center font-medium text-primary hover:underline">
        Assign it in Transactions
      </Link>
    </p>
  );
}
