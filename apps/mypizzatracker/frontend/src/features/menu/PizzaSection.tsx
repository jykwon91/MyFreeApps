import { useState } from "react";
import { Card, Button } from "@platform/ui";
import { Plus } from "lucide-react";
import AddPizzaRow from "./AddPizzaRow";
import PizzaRow from "./PizzaRow";
import type { PizzaSectionProps } from "@/types/menu/PizzaSectionProps";

export default function PizzaSection({ pizzas }: PizzaSectionProps) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Pizzas</h2>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          {showAdd ? "Cancel" : "Add pizza"}
        </Button>
      </div>

      {showAdd ? <AddPizzaRow onDone={() => setShowAdd(false)} /> : null}

      {pizzas.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground py-4">
          No pizzas yet. Add one to start building the menu.
        </p>
      ) : null}

      {pizzas.length > 0 ? (
        <ul className="divide-y">
          {pizzas.map((p) => (
            <PizzaRow key={p.id} pizza={p} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
