import { Button, FormField } from "@platform/ui";
import { Trash2 } from "lucide-react";
import ToppingChip from "./ToppingChip";
import { formatMoney } from "@/lib/formatMoney";
import type { PizzaLineRowProps } from "@/types/public/PizzaLineRowProps";

export default function PizzaLineRow({
  index,
  line,
  menu,
  canRemove,
  onChange,
  onRemove,
}: PizzaLineRowProps) {
  const pizza = menu.pizzas.find((p) => p.id === line.pizza_type_id);

  const toggleTopping = (toppingId: string) => {
    const nextSet = new Set(line.topping_type_ids);
    if (nextSet.has(toppingId)) nextSet.delete(toppingId);
    else nextSet.add(toppingId);
    onChange({ ...line, topping_type_ids: nextSet });
  };

  return (
    <div className="border rounded p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Pizza {index + 1}</span>
        {canRemove ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove pizza ${index + 1}`}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        ) : null}
      </div>

      <FormField label="Pick a pizza" required>
        {(field) => (
          <select
            value={line.pizza_type_id}
            onChange={(e) =>
              onChange({ ...line, pizza_type_id: e.target.value })
            }
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          >
            <option value="" disabled>
              Choose...
            </option>
            {menu.pizzas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} -- ${formatMoney(p.price)}
              </option>
            ))}
          </select>
        )}
      </FormField>

      {pizza?.description ? (
        <p className="text-xs text-muted-foreground -mt-2">{pizza.description}</p>
      ) : null}

      {menu.toppings.length > 0 ? (
        <FormField label="Toppings (optional)" group>
          <div className="flex flex-wrap gap-2">
            {menu.toppings.map((topping) => (
              <ToppingChip
                key={topping.id}
                topping={topping}
                selected={line.topping_type_ids.has(topping.id)}
                onClick={() => toggleTopping(topping.id)}
              />
            ))}
          </div>
        </FormField>
      ) : null}

      <FormField label="Modifications (optional)">
        {(field) => (
          <input
            type="text"
            value={line.modifications_text}
            onChange={(e) =>
              onChange({ ...line, modifications_text: e.target.value })
            }
            placeholder="extra crispy, no cheese, ..."
            maxLength={500}
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
        )}
      </FormField>
    </div>
  );
}
