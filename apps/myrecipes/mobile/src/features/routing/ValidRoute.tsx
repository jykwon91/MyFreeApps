import { ValidRouteParams, type ValidRouteParamsProps } from "@platform/mobile";
import { INVALID_LINK_FALLBACK_ROUTE, INVALID_LINK_MESSAGES } from "../../constants/invalidLink";

/** A route's screen, shown only when the link's ids and years are well formed. */
export default function ValidRoute(props: Pick<ValidRouteParamsProps, "uuids" | "years" | "integers" | "children">) {
  return <ValidRouteParams {...props} backLabel={INVALID_LINK_MESSAGES.backLabel} body={INVALID_LINK_MESSAGES.body} fallbackRoute={INVALID_LINK_FALLBACK_ROUTE} heading={INVALID_LINK_MESSAGES.heading} />;
}
