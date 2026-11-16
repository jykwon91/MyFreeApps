import { NotFoundScreen } from "@platform/mobile";
import {
  NOT_FOUND_BODY,
  NOT_FOUND_HEADING,
  NOT_FOUND_HOME_LABEL,
  NOT_FOUND_HOME_ROUTE,
} from "../src/constants/notFound";

export default function NotFound() {
  return (
    <NotFoundScreen
      body={NOT_FOUND_BODY}
      heading={NOT_FOUND_HEADING}
      homeLabel={NOT_FOUND_HOME_LABEL}
      homeRoute={NOT_FOUND_HOME_ROUTE}
    />
  );
}
