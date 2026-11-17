import { isIntegerParam } from "@platform/core/utils/isIntegerParam";
import { isUuid } from "@platform/core/utils/isUuid";
import { isYearParam } from "@platform/core/utils/isYearParam";
import { useLocalSearchParams } from "expo-router";
import type { ValidRouteParamsProps } from "../types/ValidRouteParamsProps";
import { goBackOr } from "../utils/goBackOr";
import EmptyState from "./EmptyState";

/**
 * Renders a screen only when its route params are well formed. A link with a mangled id or year
 * lands on a "can't find that" state without the screen ever asking the API about it.
 */
export default function ValidRouteParams({
  uuids = [],
  years = [],
  integers = [],
  heading,
  body,
  backLabel,
  fallbackRoute,
  children,
}: ValidRouteParamsProps) {
  const params = useLocalSearchParams();
  const valid =
    uuids.every((name) => isUuid(params[name])) &&
    years.every((name) => isYearParam(params[name])) &&
    integers.every((name) => isIntegerParam(params[name]));

  if (!valid) {
    return <EmptyState action={{ label: backLabel, onPress: () => goBackOr(fallbackRoute) }} body={body} heading={heading} />;
  }
  return <>{children}</>;
}
