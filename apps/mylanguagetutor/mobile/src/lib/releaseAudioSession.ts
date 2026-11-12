import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";

/**
 * iOS: lets go of the app's audio session once listening has ended, so music the recognizer paused can
 * resume and nothing is left routed for recording. The tutor's voice has a session of its own. Failing
 * leaves the session as recording set it (loudspeaker, by LISTENING_AUDIO_SESSION), so it's logged only.
 */
export function releaseAudioSession(): void {
  if (Platform.OS !== "ios") return;
  try {
    ExpoSpeechRecognitionModule.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true });
  } catch (error) {
    console.warn("Couldn't release the audio session after listening", error);
  }
}
