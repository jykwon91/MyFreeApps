import { Link } from "react-router-dom";
import { Card } from "@platform/ui";
import { ArrowRight } from "lucide-react";
import { OrderStatusCard } from "./OrderStatusCard";
import type { FreshConfirmationProps } from "@/types/public/FreshConfirmationProps";

export default function FreshConfirmation({ order }: FreshConfirmationProps) {
  return (
    <div className="space-y-4">
      <OrderStatusCard order={order} variant="fresh" />
      <Card>
        <p className="text-sm">
          Save the link below so you can check your order status from any
          device. We'll also text you when your pizza is ready.
        </p>
        <Link
          to={`/order/status/${order.order_id}`}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Track this order
          <ArrowRight className="h-3 w-3" />
        </Link>
      </Card>
    </div>
  );
}
