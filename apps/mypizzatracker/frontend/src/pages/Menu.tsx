import { useState } from "react";
import {
  Card,
  Button,
  LoadingButton,
  Skeleton,
  EmptyState,
  FormField,
  ConfirmDialog,
  StatusBadge,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import {
  useGetMenuQuery,
  useCreatePizzaMutation,
  useUpdatePizzaMutation,
  useDeletePizzaMutation,
  useCreateToppingMutation,
  useUpdateToppingMutation,
  useDeleteToppingMutation,
} from "@/store/menuApi";
import type {
  PizzaType,
  PizzaTypeCreateBody,
  PizzaTypeUpdateBody,
  ToppingType,
  ToppingTypeCreateBody,
  ToppingTypeUpdateBody,
} from "@/types/menu/menu";

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

// ---------------------------------------------------------------------------
// Skeletons + empty
// ---------------------------------------------------------------------------

function MenuSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <Card key={i}>
          <Skeleton className="h-6 w-32 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full" />
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pizza section
// ---------------------------------------------------------------------------

interface PizzaSectionProps {
  pizzas: PizzaType[];
}

function PizzaSection({ pizzas }: PizzaSectionProps) {
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

interface AddPizzaRowProps {
  onDone: () => void;
}

function AddPizzaRow({ onDone }: AddPizzaRowProps) {
  const [body, setBody] = useState<PizzaTypeCreateBody>({
    name: "",
    price: "0.00",
    description: "",
  });
  const [createPizza, { isLoading }] = useCreatePizzaMutation();

  const submit = async () => {
    try {
      await createPizza({
        ...body,
        description: body.description || null,
      }).unwrap();
      showSuccess("Pizza added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add pizza");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-3 p-3 rounded border bg-muted/30">
      <FormField label="Name" required>
        <input
          type="text"
          value={body.name}
          onChange={(e) => setBody({ ...body, name: e.target.value })}
          placeholder="La Clasica"
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <FormField label="Price" required>
        <input
          type="number"
          step="0.01"
          min="0"
          value={body.price}
          onChange={(e) => setBody({ ...body, price: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <FormField label="Description">
        <input
          type="text"
          value={body.description ?? ""}
          onChange={(e) => setBody({ ...body, description: e.target.value })}
          placeholder="optional"
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={submit}
        disabled={!body.name.trim() || Number(body.price) < 0}
      >
        Add
      </LoadingButton>
    </div>
  );
}

interface PizzaRowProps {
  pizza: PizzaType;
}

function PizzaRow({ pizza }: PizzaRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatePizza, { isLoading: isSaving }] = useUpdatePizzaMutation();
  const [deletePizza, { isLoading: isDeleting }] = useDeletePizzaMutation();
  const [draft, setDraft] = useState<PizzaTypeUpdateBody>({
    name: pizza.name,
    price: pizza.price,
    description: pizza.description ?? "",
  });

  const toggleActive = async () => {
    try {
      await updatePizza({
        id: pizza.id,
        body: { active: !pizza.active },
      }).unwrap();
      showSuccess(pizza.active ? "86'd" : "Re-activated");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to toggle");
    }
  };

  const save = async () => {
    try {
      await updatePizza({
        id: pizza.id,
        body: {
          name: draft.name,
          price: draft.price,
          description: draft.description || null,
        },
      }).unwrap();
      showSuccess("Updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

  const onDelete = async () => {
    try {
      await deletePizza(pizza.id).unwrap();
      showSuccess("Pizza deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete");
    }
  };

  if (editing) {
    return (
      <li className="py-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <FormField label="Name">
          <input
            type="text"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Price">
          <input
            type="number"
            step="0.01"
            min="0"
            value={draft.price ?? ""}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Description">
          <input
            type="text"
            value={draft.description ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <div className="flex gap-2">
          <LoadingButton
            size="sm"
            isLoading={isSaving}
            onClick={save}
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </LoadingButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className={pizza.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
          {pizza.name}
        </span>
        <span className="text-sm text-muted-foreground">
          ${formatMoney(pizza.price)}
        </span>
        {pizza.description ? (
          <span className="text-xs text-muted-foreground truncate max-w-xs">
            {pizza.description}
          </span>
        ) : null}
        {!pizza.active ? (
          <StatusBadge tone="warning" label="86'd" />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <LoadingButton
          size="sm"
          variant="ghost"
          isLoading={isSaving}
          onClick={toggleActive}
        >
          {pizza.active ? "86" : "Un-86"}
        </LoadingButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${pizza.name}?`}
        description="This removes the pizza type entirely. Use the 86 toggle if you just want to hide it temporarily."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Topping section
// ---------------------------------------------------------------------------

interface ToppingSectionProps {
  toppings: ToppingType[];
}

function ToppingSection({ toppings }: ToppingSectionProps) {
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

interface AddToppingRowProps {
  onDone: () => void;
}

function AddToppingRow({ onDone }: AddToppingRowProps) {
  const [body, setBody] = useState<ToppingTypeCreateBody>({
    name: "",
    price_delta: "0.00",
  });
  const [createTopping, { isLoading }] = useCreateToppingMutation();

  const submit = async () => {
    try {
      await createTopping(body).unwrap();
      showSuccess("Topping added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add topping");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-3 p-3 rounded border bg-muted/30">
      <FormField label="Name" required>
        <input
          type="text"
          value={body.name}
          onChange={(e) => setBody({ ...body, name: e.target.value })}
          placeholder="Red Bell Pepper"
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <FormField label="Price delta">
        <input
          type="number"
          step="0.01"
          min="0"
          value={body.price_delta ?? "0.00"}
          onChange={(e) =>
            setBody({ ...body, price_delta: e.target.value })
          }
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={submit}
        disabled={!body.name.trim()}
      >
        Add
      </LoadingButton>
    </div>
  );
}

interface ToppingRowProps {
  topping: ToppingType;
}

function ToppingRow({ topping }: ToppingRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updateTopping, { isLoading: isSaving }] = useUpdateToppingMutation();
  const [deleteTopping, { isLoading: isDeleting }] = useDeleteToppingMutation();
  const [draft, setDraft] = useState<ToppingTypeUpdateBody>({
    name: topping.name,
    price_delta: topping.price_delta,
  });

  const toggleActive = async () => {
    try {
      await updateTopping({
        id: topping.id,
        body: { active: !topping.active },
      }).unwrap();
      showSuccess(topping.active ? "86'd" : "Re-activated");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to toggle");
    }
  };

  const save = async () => {
    try {
      await updateTopping({
        id: topping.id,
        body: { name: draft.name, price_delta: draft.price_delta },
      }).unwrap();
      showSuccess("Updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

  const onDelete = async () => {
    try {
      await deleteTopping(topping.id).unwrap();
      showSuccess("Topping deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete");
    }
  };

  if (editing) {
    return (
      <li className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <FormField label="Name">
          <input
            type="text"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Price delta">
          <input
            type="number"
            step="0.01"
            min="0"
            value={draft.price_delta ?? "0.00"}
            onChange={(e) =>
              setDraft({ ...draft, price_delta: e.target.value })
            }
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <div className="flex gap-2">
          <LoadingButton
            size="sm"
            isLoading={isSaving}
            onClick={save}
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </LoadingButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <span className={topping.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
          {topping.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {Number(topping.price_delta) === 0
            ? "free"
            : `+$${formatMoney(topping.price_delta)}`}
        </span>
        {!topping.active ? (
          <StatusBadge tone="warning" label="86'd" />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <LoadingButton
          size="sm"
          variant="ghost"
          isLoading={isSaving}
          onClick={toggleActive}
        >
          {topping.active ? "86" : "Un-86"}
        </LoadingButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${topping.name}?`}
        description="This removes the topping entirely. Use the 86 toggle if you just want to hide it temporarily."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(2);
}
