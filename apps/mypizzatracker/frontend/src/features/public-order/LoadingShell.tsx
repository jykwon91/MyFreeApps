import { Card, Skeleton } from "@platform/ui";
import OrderStack from "@/features/public-order/OrderStack";
import PickupSlotGrid from "@/features/public-order/PickupSlotGrid";

const SLOT_PLACEHOLDERS = [0, 1, 2, 3];
const DETAIL_PLACEHOLDERS = [0, 1, 2];

/** The order page's five cards while the drop and menu load: drop header, pickup time, pizzas, details (name, phone, payment), total. */
export default function LoadingShell() {
  return (
    <>
      <Card>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-full" />
      </Card>
      <OrderStack>
        <Card>
          <Skeleton className="h-7 w-32 mb-3" />
          <PickupSlotGrid>
            {SLOT_PLACEHOLDERS.map((i) => (
              <li key={i}>
                <Skeleton className="h-[3.875rem] w-full" />
              </li>
            ))}
          </PickupSlotGrid>
        </Card>
        <Card>
          <Skeleton className="h-8 w-full mb-3" />
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-7 w-32 mb-3" />
          <div className="space-y-3">
            {DETAIL_PLACEHOLDERS.map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="h-7 w-full mb-1" />
          <Skeleton className="h-4 w-full mb-3" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </OrderStack>
    </>
  );
}
