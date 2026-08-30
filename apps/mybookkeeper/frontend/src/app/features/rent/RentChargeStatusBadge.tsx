import { StatusBadge } from "@platform/ui";
import {
  RENT_CHARGE_STATUS_LABEL,
  RENT_CHARGE_STATUS_TONE,
} from "./rent-charge-status-tone";
import type { RentChargeStatus } from "@/shared/types/rent/rent-charge-status";

export interface RentChargeStatusBadgeProps {
  status: RentChargeStatus;
  "data-testid"?: string;
}

export default function RentChargeStatusBadge({
  status,
  "data-testid": testId,
}: RentChargeStatusBadgeProps) {
  return (
    <StatusBadge
      tone={RENT_CHARGE_STATUS_TONE[status]}
      label={RENT_CHARGE_STATUS_LABEL[status]}
      data-testid={testId}
    />
  );
}
