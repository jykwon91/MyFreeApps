/**
 * How many carriers each market group shows before the rest collapse.
 *
 * Mirrors ``MARKET_GROUP_PREVIEW`` in the backend's
 * ``tdi_rate_filings_constants``. The backend caps what it sends; this caps
 * what is shown at rest.
 */
export const MARKET_GROUP_PREVIEW = 5;

/**
 * How many carrier names the action item asks the operator to quote.
 *
 * Deliberately shorter than the list below it. This one is meant to be read
 * out on a call with an agent, and a request for five carriers is a research
 * project rather than a question. The rest stay one scroll away under
 * "Holding rates flat".
 */
export const ACTION_CARRIER_LIMIT = 3;
