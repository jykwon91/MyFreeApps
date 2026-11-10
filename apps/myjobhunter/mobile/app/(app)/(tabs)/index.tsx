import { ComingToAppScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../../../src/constants/api";
import { DASHBOARD_TAB } from "../../../src/constants/tabs";

export default function Dashboard() {
  return <ComingToAppScreen title={DASHBOARD_TAB.title} webBaseUrl={WEB_BASE_URL} webPath={DASHBOARD_TAB.webPath} />;
}
