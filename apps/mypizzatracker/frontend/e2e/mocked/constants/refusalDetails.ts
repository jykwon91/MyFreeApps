/** fastapi-users' refusal of a wrong email or password (ErrorCode.LOGIN_BAD_CREDENTIALS), a 400. */
export const LOGIN_BAD_CREDENTIALS = "LOGIN_BAD_CREDENTIALS";
/** What GET /public/drops/current refuses with when no drop is taking orders (app/api/public.py), a 404. */
export const NO_ACTIVE_DROP = "No drop is currently accepting orders. Check back soon!";
/** What GET /public/customers/lookup refuses with for an unknown phone (app/api/public.py), a 404. */
export const NO_CUSTOMER = "No customer with that phone.";
