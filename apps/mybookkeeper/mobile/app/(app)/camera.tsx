import { Redirect } from "expo-router";
import CaptureScreen from "../../src/features/capture/CaptureScreen";
import { useCanWrite } from "../../src/features/workspace/useCanWrite";

export default function CameraRoute() {
  const canWrite = useCanWrite();
  return canWrite ? <CaptureScreen /> : <Redirect href="/money" />;
}
