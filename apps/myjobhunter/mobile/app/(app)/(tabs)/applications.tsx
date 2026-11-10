import { ComingToAppScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../../../src/constants/api";
import { APPLICATIONS_TAB } from "../../../src/constants/tabs";

export default function Applications() {
  return <ComingToAppScreen title={APPLICATIONS_TAB.title} webBaseUrl={WEB_BASE_URL} webPath={APPLICATIONS_TAB.webPath} />;
}
