import { useMemo, useState } from "react";
import {
  Card,
  Button,
  LoadingButton,
  Skeleton,
  EmptyState,
  FormField,
  StatusBadge,
  showError,
  extractErrorMessage,
} from "@platform/ui";
import { Plus, Trash2, Pizza, Phone, CheckCircle2 } from "lucide-react";
import {
  useGetCurrentPublicDropQuery,
  useGetPublicMenuQuery,
  usePlacePublicOrderMutation,
} from "@/store/publicApi";
import type {
  PublicDrop,
  PublicMenu,
  PublicOrderConfirmation,
  PublicOrderCreateBody,
  PublicSlot,
  PublicTopping,
} from "@/types/public/public";
import {
  PAYMENT_METHOD_OPTIONS,
  PUBLIC_PAYMENT_STATUS_LABELS,
  PUBLIC_ORDER_STATUS_LABELS,
} from "@/types/public/public";

/**
 * Customer-facing order placement page (mounted at /order, no auth).
 *
 * Flow:
 *   1. Fetch the current active drop + the public menu in parallel.
 *   2. If no active drop, show an empty-state with a "check back later" message.
 *   3. Render the order builder: pick a slot, add 1+ pizzas (each with optional
 *      toppings + modifications), enter name + phone + payment method, submit.
 *   4. On success, swap the builder for the confirmation card. The customer
 *      can refresh the page to place another order.
 *
 * The status-check page (PR 6) will live at /order/status and reuse the
 * confirmation card layout.
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
        <Confirmation confirmation={confirmation} />
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

// ---------------------------------------------------------------------------
// Shell + states
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 sm:p-8 space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Pizza className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Desmadre Pizza Drop</h1>
            <p className="text-xs text-muted-foreground">Order pickup</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function NoActiveDrop() {
  return (
    <EmptyState
      heading="No drop running right now"
      body="Check back here when the next drop is announced. Orders open once the host activates a drop."
    />
  );
}

// ---------------------------------------------------------------------------
// Drop summary
// ---------------------------------------------------------------------------

interface DropHeaderProps {
  drop: PublicDrop;
}

function DropHeader({ drop }: DropHeaderProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">{drop.name}</h2>
      <p className="text-sm text-muted-foreground">
        {formatDateLong(drop.date)} -- pickup window {formatTime(drop.slot_window_start)} to {formatTime(drop.slot_window_end)}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Order builder
// ---------------------------------------------------------------------------

/**
 * Local state for a single pizza line under construction. Differs from the
 * wire shape in that toppings live as a Set for cheap toggle/duplicate
 * detection; we serialize back to an array at submit time.
 */
interface PizzaLineDraft {
  /** Unique local id for React keys + remove. NOT the pizza_type_id. */
  localId: string;
  pizza_type_id: string;
  topping_type_ids: Set<string>;
  modifications_text: string;
}

interface OrderBuilderProps {
  drop: PublicDrop;
  menu: PublicMenu;
  onPlaced: (confirmation: PublicOrderConfirmation) => void;
}

function OrderBuilder({ drop, menu, onPlaced }: OrderBuilderProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [lines, setLines] = useState<PizzaLineDraft[]>(() => [newDraft(menu)]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    PAYMENT_METHOD_OPTIONS[0]?.tag ?? "venmo",
  );
  const [placeOrder, { isLoading }] = usePlacePublicOrderMutation();

  const selectedSlot = drop.slots.find((s) => s.id === selectedSlotId);
  const slotsWithCapacity = drop.slots.filter((s) => s.remaining_pizzas > 0);

  const orderTotal = useMemo(
    () => computeTotalForDrafts(lines, menu),
    [lines, menu],
  );

  const slotCapacityOk =
    selectedSlot !== undefined && lines.length <= selectedSlot.remaining_pizzas;

  const trimmedPhoneDigits = (customerPhone.match(/\d/g) || []).length;

  const valid =
    Boolean(selectedSlotId) &&
    lines.length > 0 &&
    lines.every((line) => Boolean(line.pizza_type_id)) &&
    customerName.trim().length > 0 &&
    trimmedPhoneDigits >= 7 &&
    paymentMethod.length > 0 &&
    slotCapacityOk;

  const submit = async () => {
    if (!valid || !selectedSlot) return;
    const body: PublicOrderCreateBody = {
      drop_id: drop.id,
      slot_id: selectedSlot.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      payment_method_tag: paymentMethod,
      pizzas: lines.map((line) => ({
        pizza_type_id: line.pizza_type_id,
        topping_type_ids: Array.from(line.topping_type_ids),
        modifications_text: line.modifications_text.trim() || null,
      })),
    };
    try {
      const result = await placeOrder(body).unwrap();
      onPlaced(result);
    } catch (err) {
      showError(extractErrorMessage(err) || "Could not place your order");
    }
  };

  if (slotsWithCapacity.length === 0) {
    return (
      <EmptyState
        heading="All slots are full"
        body="This drop is fully booked. Check back next time!"
      />
    );
  }

  return (
    <div className="space-y-4">
      <SlotPicker
        slots={drop.slots}
        selectedSlotId={selectedSlotId}
        onSelect={setSelectedSlotId}
      />

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Your pizzas</h2>
          <Button
            size="sm"
            onClick={() => setLines((prev) => [...prev, newDraft(menu)])}
            disabled={menu.pizzas.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add pizza
          </Button>
        </div>

        {menu.pizzas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The menu is empty right now. Check back later.
          </p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line, index) => (
              <li key={line.localId}>
                <PizzaLineRow
                  index={index}
                  line={line}
                  menu={menu}
                  canRemove={lines.length > 1}
                  onChange={(next) =>
                    setLines((prev) =>
                      prev.map((p) => (p.localId === line.localId ? next : p)),
                    )
                  }
                  onRemove={() =>
                    setLines((prev) => prev.filter((p) => p.localId !== line.localId))
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {!slotCapacityOk && selectedSlot ? (
          <p className="mt-3 text-sm text-destructive">
            That slot only has {selectedSlot.remaining_pizzas} pizza(s) left.
            Reduce your order or pick a different slot.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">Your details</h2>
        <div className="space-y-3">
          <FormField label="Name" required>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-3 py-2 rounded border bg-background"
              autoComplete="name"
            />
          </FormField>
          <FormField label="Phone (for pickup ready text)" required>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(512) 555-1234"
              className="w-full px-3 py-2 rounded border bg-background"
              autoComplete="tel"
            />
          </FormField>
          <FormField label="How will you pay?" required>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <PaymentMethodChip
                  key={opt.tag}
                  selected={paymentMethod === opt.tag}
                  label={opt.label}
                  onClick={() => setPaymentMethod(opt.tag)}
                />
              ))}
            </div>
          </FormField>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-semibold">${orderTotal.toFixed(2)}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Pay {paymentMethodLabel(paymentMethod)} when you pick up. We'll text you when it's ready.
        </p>
        <LoadingButton
          size="md"
          isLoading={isLoading}
          loadingText="Placing order..."
          onClick={submit}
          disabled={!valid || isLoading}
          className="w-full"
        >
          Place order
        </LoadingButton>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SlotPickerProps {
  slots: PublicSlot[];
  selectedSlotId: string;
  onSelect: (id: string) => void;
}

function SlotPicker({ slots, selectedSlotId, onSelect }: SlotPickerProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Pickup time</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((slot) => {
          const isSelected = slot.id === selectedSlotId;
          const isFull = slot.remaining_pizzas <= 0;
          return (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => !isFull && onSelect(slot.id)}
                disabled={isFull}
                className={[
                  "w-full text-left px-3 py-2 rounded border transition-colors",
                  isSelected ? "border-primary bg-primary/10" : "border-input",
                  isFull ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer",
                ].join(" ")}
                aria-pressed={isSelected}
              >
                <div className="font-medium">{formatTime(slot.pickup_time)}</div>
                <div className="text-xs text-muted-foreground">
                  {isFull ? "Full" : `${slot.remaining_pizzas} pizza(s) left`}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

interface PizzaLineRowProps {
  index: number;
  line: PizzaLineDraft;
  menu: PublicMenu;
  canRemove: boolean;
  onChange: (next: PizzaLineDraft) => void;
  onRemove: () => void;
}

function PizzaLineRow({
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
        <select
          value={line.pizza_type_id}
          onChange={(e) =>
            onChange({ ...line, pizza_type_id: e.target.value })
          }
          className="w-full px-3 py-2 rounded border bg-background"
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
      </FormField>

      {pizza?.description ? (
        <p className="text-xs text-muted-foreground -mt-2">{pizza.description}</p>
      ) : null}

      {menu.toppings.length > 0 ? (
        <FormField label="Toppings (optional)">
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
        <input
          type="text"
          value={line.modifications_text}
          onChange={(e) =>
            onChange({ ...line, modifications_text: e.target.value })
          }
          placeholder="extra crispy, no cheese, ..."
          maxLength={500}
          className="w-full px-3 py-2 rounded border bg-background"
        />
      </FormField>
    </div>
  );
}

interface ToppingChipProps {
  topping: PublicTopping;
  selected: boolean;
  onClick: () => void;
}

function ToppingChip({ topping, selected, onClick }: ToppingChipProps) {
  const priceSuffix =
    Number(topping.price_delta) === 0 ? "" : ` +$${formatMoney(topping.price_delta)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "px-3 py-1 text-sm rounded-full border transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-input hover:bg-muted/50",
      ].join(" ")}
    >
      {topping.name}
      {priceSuffix}
    </button>
  );
}

interface PaymentMethodChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function PaymentMethodChip({ label, selected, onClick }: PaymentMethodChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "px-3 py-1.5 text-sm rounded border transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-input hover:bg-muted/50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

interface ConfirmationProps {
  confirmation: PublicOrderConfirmation;
}

function Confirmation({ confirmation }: ConfirmationProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Order placed!</h2>
            <p className="text-sm text-muted-foreground">
              Pickup at {formatTime(confirmation.slot_pickup_time)} on {formatDateLong(confirmation.drop_date)}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order #</span>
            <span className="font-mono">{shortId(confirmation.order_id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{confirmation.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              <Phone className="inline h-3 w-3 mr-1" />
              Phone
            </span>
            <span>{formatPhoneDisplay(confirmation.customer_phone)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge tone="info" label={PUBLIC_ORDER_STATUS_LABELS[confirmation.status]} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span>
              {paymentMethodLabel(confirmation.payment_method_tag)} (
              {PUBLIC_PAYMENT_STATUS_LABELS[confirmation.payment_status]})
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-3">Your order</h3>
        <ul className="divide-y">
          {confirmation.pizzas.map((p, i) => (
            <li key={i} className="py-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-medium">{p.pizza_name}</div>
                  {p.toppings.length > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      + {p.toppings.join(", ")}
                    </div>
                  ) : null}
                  {p.modifications_text ? (
                    <div className="text-xs italic text-muted-foreground">
                      "{p.modifications_text}"
                    </div>
                  ) : null}
                </div>
                <div className="text-sm shrink-0">
                  ${formatMoney(p.line_total)}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>${formatMoney(confirmation.total)}</span>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Save your order # to check status later. We'll text you when your pizza is ready.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newDraft(menu: PublicMenu): PizzaLineDraft {
  return {
    localId: cryptoRandomId(),
    pizza_type_id: menu.pizzas[0]?.id ?? "",
    topping_type_ids: new Set(),
    modifications_text: "",
  };
}

function computeTotalForDrafts(
  lines: PizzaLineDraft[], menu: PublicMenu,
): number {
  let total = 0;
  for (const line of lines) {
    const pizza = menu.pizzas.find((p) => p.id === line.pizza_type_id);
    if (!pizza) continue;
    total += Number(pizza.price);
    for (const toppingId of line.topping_type_ids) {
      const topping = menu.toppings.find((t) => t.id === toppingId);
      if (topping) total += Number(topping.price_delta);
    }
  }
  return total;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
}

function formatTime(time: string): string {
  // Expecting "HH:MM:SS" or "HH:MM"
  const [hh = "00", mm = "00"] = time.split(":");
  const h = Number(hh);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${mm} ${period}`;
}

function formatDateLong(iso: string): string {
  // iso = "YYYY-MM-DD" -- build a local-date Date so we don't drift across TZ.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function paymentMethodLabel(tag: string): string {
  return (
    PAYMENT_METHOD_OPTIONS.find((o) => o.tag === tag)?.label ?? tag
  );
}

function formatPhoneDisplay(digits: string): string {
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
