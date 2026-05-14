import { Link, useParams } from "react-router-dom";
import { Card, EmptyState, Skeleton, extractErrorMessage } from "@platform/ui";
import { Pizza, ArrowRight } from "lucide-react";
import { useGetPublicOrderQuery } from "@/store/publicApi";
import { OrderStatusCard } from "@/features/public-order/OrderStatusCard";
import {
  formatDateLong,
  formatTime,
  shortId,
} from "@/features/public-order/formatters";
import { listSavedOrders } from "@/features/public-order/savedOrders";

/**
 * Customer-facing order status page.
 *
 *   /order/status               -> list saved orders from this browser (or
 *                                  an empty state pointing back to /order).
 *   /order/status/:orderId      -> fetch + render the order via OrderStatusCard.
 *
 * Authentication: none. The order_id (UUID) is the access token. PR 5 hands
 * it to the customer at placement time and persists it via savedOrders.
 */
export default function PublicOrderStatusPage() {
  const { orderId } = useParams<{ orderId?: string }>();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 sm:p-8 space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Pizza className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Desmadre Pizza Drop</h1>
            <p className="text-xs text-muted-foreground">Order status</p>
          </div>
        </header>
        {orderId ? <SingleOrderView orderId={orderId} /> : <RecentOrdersList />}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Single-order lookup
// ---------------------------------------------------------------------------

interface SingleOrderViewProps {
  orderId: string;
}

function SingleOrderView({ orderId }: SingleOrderViewProps) {
  const query = useGetPublicOrderQuery(orderId);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError && (query.error as { status?: number })?.status === 404) {
    return (
      <EmptyState
        heading="Order not found"
        body="The link may be wrong or the order was deleted. Double-check the URL from your confirmation."
        action={{ label: "Place a new order", onClick: () => { window.location.href = "/order"; } }}
      />
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        heading="Could not load this order"
        body={extractErrorMessage(query.error) || "Please try again."}
        action={{ label: "Retry", onClick: () => query.refetch() }}
      />
    );
  }

  if (!query.data) return null;

  return <OrderStatusCard order={query.data} variant="lookup" />;
}

// ---------------------------------------------------------------------------
// Recent-orders list (no :orderId in URL)
// ---------------------------------------------------------------------------

function RecentOrdersList() {
  const saved = listSavedOrders();

  if (saved.length === 0) {
    return (
      <EmptyState
        heading="No saved orders"
        body="Orders placed from this browser will appear here. Place one to get started."
        action={{
          label: "Place an order",
          onClick: () => { window.location.href = "/order"; },
        }}
      />
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Your recent orders</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Stored locally in this browser only -- clear your browser data and
        this list goes away. The orders themselves are kept server-side.
      </p>
      <ul className="divide-y">
        {saved.map((entry) => (
          <li key={entry.order_id} className="py-3">
            <Link
              to={`/order/status/${entry.order_id}`}
              className="flex items-center justify-between gap-3 hover:bg-muted/30 -mx-2 px-2 py-1 rounded"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {entry.drop_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateLong(entry.drop_date)} -- pickup {formatTime(entry.slot_pickup_time)}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  #{shortId(entry.order_id)} -- {entry.customer_name}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
