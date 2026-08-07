/**
 * What the dashboard renewal-alert card should render.
 *
 * ``clear`` is distinct from ``hidden``: the card renders a reassuring line
 * when plans exist and none need attention, and disappears entirely when the
 * operator tracks no plans at all — an empty card on a dashboard is noise.
 */
export type UtilityPlanAlertCardMode = "loading" | "error" | "hidden" | "clear" | "alerts";
