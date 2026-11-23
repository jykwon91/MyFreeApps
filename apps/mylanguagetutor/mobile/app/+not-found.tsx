import { NotFoundScreen } from "@platform/mobile";
import { NOT_FOUND_COPY } from "@mylanguagetutor/api-client/constants/notFoundCopy";
import { NOT_FOUND_HOME_ROUTE } from "../src/constants/notFound";

export default function NotFound() {
  return (
    <NotFoundScreen
      body={NOT_FOUND_COPY.body}
      heading={NOT_FOUND_COPY.heading}
      homeLabel={NOT_FOUND_COPY.homeLabel}
      homeRoute={NOT_FOUND_HOME_ROUTE}
    />
  );
}
