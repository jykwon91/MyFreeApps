import { ComingToAppScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../../../src/constants/api";
import { PRACTICE_TAB } from "../../../src/constants/tabs";

export default function Practice() {
  return <ComingToAppScreen title={PRACTICE_TAB.title} webBaseUrl={WEB_BASE_URL} webPath={PRACTICE_TAB.webPath} />;
}
