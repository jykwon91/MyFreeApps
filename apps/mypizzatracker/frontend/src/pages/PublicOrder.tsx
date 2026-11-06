import { useState } from "react";
import { EmptyState, extractErrorMessage } from "@platform/ui";
import { useGetCurrentPublicDropQuery, useGetPublicMenuQuery } from "@/store/publicApi";
import type { PublicOrderConfirmation } from "@/types/public/public";
import PageShell from "@/features/public-order/PageShell";
import LoadingShell from "@/features/public-order/LoadingShell";
import NoActiveDrop from "@/features/public-order/NoActiveDrop";
import DropHeader from "@/features/public-order/DropHeader";
import FreshConfirmation from "@/features/public-order/FreshConfirmation";
import OrderBuilder from "@/features/public-order/OrderBuilder";

/**
 * Customer-facing order placement page (mounted at /order, no auth).
 *
 * Flow:
 *   1. Fetch the current active drop + the public menu in parallel.
 *   2. If no active drop, show an empty-state with a "check back later" message.
 *   3. Render the order builder: pick a slot, add 1+ pizzas (each with optional
 *      toppings + modifications), enter name + phone + payment method, submit.
 *   4. On success, swap the builder for the confirmation card and persist the
 *      order ID to localStorage so /order/status can list it later. The
 *      customer can also jump to /order/status/:id directly from here.
 */
export default function PublicOrderPage() {
  const dropQuery = useGetCurrentPublicDropQuery();
  const menuQuery = useGetPublicMenuQuery();
  const [confirmation, setConfirmation] = useState<PublicOrderConfirmation | null>(null);

  if (dropQuery.isLoading || menuQuery.isLoading) {
    return <PageShell><LoadingShell /></PageShell>;
  }

  if (dropQuery.isError && (dropQuery.error as { status?: number })?.status === 404) {
    return <PageShell><NoActiveDrop /></PageShell>;
  }

  if (dropQuery.isError) {
    return (
      <PageShell>
        <EmptyState
          heading="Could not load the current drop"
          body={extractErrorMessage(dropQuery.error) || "Please try again."}
          action={{ label: "Retry", onClick: () => dropQuery.refetch() }}
        />
      </PageShell>
    );
  }

  if (menuQuery.isError) {
    return (
      <PageShell>
        <EmptyState
          heading="Could not load the menu"
          body={extractErrorMessage(menuQuery.error) || "Please try again."}
          action={{ label: "Retry", onClick: () => menuQuery.refetch() }}
        />
      </PageShell>
    );
  }

  const drop = dropQuery.data;
  const menu = menuQuery.data;
  if (!drop || !menu) {
    return <PageShell><LoadingShell /></PageShell>;
  }

  if (confirmation) {
    return (
      <PageShell>
        <FreshConfirmation order={confirmation} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <DropHeader drop={drop} />
      <OrderBuilder
        drop={drop}
        menu={menu}
        onPlaced={setConfirmation}
      />
    </PageShell>
  );
}
