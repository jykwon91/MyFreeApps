import { EmptyState, extractErrorMessage } from "@platform/ui";
import { useGetMenuQuery } from "@/store/menuApi";
import MenuSkeleton from "@/features/menu/MenuSkeleton";
import PizzaSection from "@/features/menu/PizzaSection";
import ToppingSection from "@/features/menu/ToppingSection";

export default function MenuPage() {
  const { data, isLoading, isError, error, refetch } = useGetMenuQuery();

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage pizzas + toppings. 86 a row to hide it from the customer menu
          without deleting it.
        </p>
      </header>

      {isLoading ? <MenuSkeleton /> : null}
      {isError ? (
        <EmptyState
          heading="Could not load the menu"
          body={extractErrorMessage(error) || "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      ) : null}

      {data ? (
        <>
          <PizzaSection pizzas={data.pizzas} />
          <ToppingSection toppings={data.toppings} />
        </>
      ) : null}
    </main>
  );
}
