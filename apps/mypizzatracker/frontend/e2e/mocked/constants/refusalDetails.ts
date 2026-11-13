/** What GET /public/drops/current refuses with when no drop is taking orders (app/api/public.py), a 404. */
export const NO_ACTIVE_DROP = "No drop is currently accepting orders. Check back soon!";
/** What GET /public/customers/lookup refuses with for an unknown phone (app/api/public.py), a 404. */
export const NO_CUSTOMER = "No customer with that phone.";
/** What POST /public/orders refuses with when the slot has too little capacity left (SlotCapacityExceededError), a 400. */
export const SLOT_FILLED = "Only 0 pizza(s) left in this slot. Requested 1.";
/** What POST /public/orders refuses with when the drop is closed (DropNotOpenError), a 400. */
export const DROP_CLOSED = "Drop is not currently accepting orders (status='closed').";
/** What POST /public/orders refuses with when the slot no longer exists (SlotNotFoundError), a 404. */
export const SLOT_GONE = "Slot slot-0001 not found";
