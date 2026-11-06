import { useState } from "react";
import { Card, Button } from "@platform/ui";
import { Plus } from "lucide-react";
import AddToppingRow from "./AddToppingRow";
import ToppingRow from "./ToppingRow";
import type { ToppingSectionProps } from "@/types/menu/ToppingSectionProps";

export default function ToppingSection({ toppings }: ToppingSectionProps) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Toppings</h2>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          {showAdd ? "Cancel" : "Add topping"}
        </Button>
      </div>

      {showAdd ? <AddToppingRow onDone={() => setShowAdd(false)} /> : null}

      {toppings.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground py-4">
          No toppings yet. Add red bell pepper, mushrooms, or whatever else
          you're stocking.
        </p>
      ) : null}

      {toppings.length > 0 ? (
        <ul className="divide-y">
          {toppings.map((t) => (
            <ToppingRow key={t.id} topping={t} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
