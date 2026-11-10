import { ComingToAppScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../../../src/constants/api";
import { PROFILE_TAB } from "../../../src/constants/tabs";

export default function Profile() {
  return <ComingToAppScreen title={PROFILE_TAB.title} webBaseUrl={WEB_BASE_URL} webPath={PROFILE_TAB.webPath} />;
}
