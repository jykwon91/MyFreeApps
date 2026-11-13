import { useMemo, useState } from "react";
import {
  Card,
  Button,
  LoadingButton,
  EmptyState,
  FormField,
  showError,
  extractErrorMessage,
  useDebouncedValue,
} from "@platform/ui";
import { Plus } from "lucide-react";
import { useLookupPublicCustomerQuery, usePlacePublicOrderMutation } from "@/store/publicApi";
import type { PublicOrderCreateBody } from "@/types/public/public";
import type { PizzaLineDraft } from "@/types/public/PizzaLineDraft";
import { PAYMENT_METHOD_OPTIONS } from "@/types/public/public";
import { paymentMethodLabel } from "@/features/public-order/formatters";
import { formatMoney } from "@/lib/formatMoney";
import { saveOrder } from "@/features/public-order/savedOrders";
import { countPhoneDigits, selectOrderableTheUsual } from "@/features/public-order/applyTheUsual";
import { computeTotalForDrafts, cryptoRandomId, newDraft } from "@/features/public-order/pizzaDrafts";
import OrderStack from "@/features/public-order/OrderStack";
import SlotPicker from "@/features/public-order/SlotPicker";
import PizzaLineRow from "@/features/public-order/PizzaLineRow";
import WelcomeBack from "@/features/public-order/WelcomeBack";
import PaymentMethodChip from "@/features/public-order/PaymentMethodChip";
import type { OrderBuilderProps } from "@/types/public/OrderBuilderProps";

export default function OrderBuilder({ drop, menu, onPlaced }: OrderBuilderProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [lines, setLines] = useState<PizzaLineDraft[]>(() => [newDraft(menu)]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    PAYMENT_METHOD_OPTIONS[0]?.tag ?? "venmo",
  );
  // Once the customer has applied "the usual", they shouldn't be re-prompted
  // every time they tweak the phone. Locking the banner after one apply keeps
  // the page calm; clearing the phone field resets it.
  const [usualApplied, setUsualApplied] = useState(false);
  const [placeOrder, { isLoading }] = usePlacePublicOrderMutation();

  // Debounce + gate the customer lookup. Only fire when the customer has
  // typed something that could realistically match a phone (>=7 digits) and
  // when the value has been still for 400ms.
  const debouncedPhone = useDebouncedValue(customerPhone, 400);
  const debouncedDigits = countPhoneDigits(debouncedPhone);
  const lookupQuery = useLookupPublicCustomerQuery(debouncedPhone, {
    skip: debouncedDigits < 7 || usualApplied,
  });

  // Pre-fill an empty name once per lookup result, during render. Never
  // overwrite something the customer typed, and don't refill a name they
  // cleared on purpose.
  const [prefilledFrom, setPrefilledFrom] = useState(lookupQuery.data);
  if (lookupQuery.data && lookupQuery.data !== prefilledFrom) {
    setPrefilledFrom(lookupQuery.data);
    if (lookupQuery.data.customer_name && customerName.trim() === "") {
      setCustomerName(lookupQuery.data.customer_name);
    }
  }

  // Clearing the phone resets the "applied" lock so a different customer
  // on a shared device can get their own "welcome back".
  const handlePhoneChange = (phone: string) => {
    setCustomerPhone(phone);
    if (countPhoneDigits(phone) < 7) setUsualApplied(false);
  };

  const orderableTheUsual = useMemo(() => {
    if (!lookupQuery.data) return [];
    return selectOrderableTheUsual(lookupQuery.data.the_usual, menu);
  }, [lookupQuery.data, menu]);

  const applyTheUsual = () => {
    // The banner can outlive the phone for the debounce window; applying then
    // would set a lock that no later phone change clears.
    if (orderableTheUsual.length === 0 || countPhoneDigits(customerPhone) < 7) return;
    setLines(
      orderableTheUsual.map((line) => ({
        localId: cryptoRandomId(),
        pizza_type_id: line.pizza_type_id,
        topping_type_ids: new Set(line.topping_type_ids),
        modifications_text: line.modifications_text,
      })),
    );
    setUsualApplied(true);
  };

  const selectedSlot = drop.slots.find((s) => s.id === selectedSlotId);
  const slotsWithCapacity = drop.slots.filter((s) => s.remaining_pizzas > 0);

  const orderTotal = useMemo(
    () => computeTotalForDrafts(lines, menu),
    [lines, menu],
  );

  const slotCapacityOk =
    selectedSlot !== undefined && lines.length <= selectedSlot.remaining_pizzas;

  const trimmedPhoneDigits = countPhoneDigits(customerPhone);

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
      saveOrder({
        order_id: result.order_id,
        customer_name: result.customer_name,
        drop_name: result.drop_name,
        drop_date: result.drop_date,
        slot_pickup_time: result.slot_pickup_time,
        saved_at: new Date().toISOString(),
      });
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
    <OrderStack>
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
            {(field) => (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 rounded border bg-background"
                autoComplete="name"
                {...field}
              />
            )}
          </FormField>
          <FormField label="Phone (for pickup ready text)" required>
            {(field) => (
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="(512) 555-1234"
                className="w-full px-3 py-2 rounded border bg-background"
                autoComplete="tel"
                {...field}
              />
            )}
          </FormField>

          {lookupQuery.data ? (
            <WelcomeBack
              name={lookupQuery.data.customer_name}
              theUsualCount={orderableTheUsual.length}
              applied={usualApplied}
              onApply={applyTheUsual}
            />
          ) : null}
          <FormField label="How will you pay?" required group>
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
          <span className="text-xl font-semibold">${formatMoney(orderTotal)}</span>
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
    </OrderStack>
  );
}
