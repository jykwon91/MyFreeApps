import * as SecureStore from "expo-secure-store";
import { RESUME_SESSION_ID_KEY } from "../constants/resumeStorage";

/** The session the phone was last working on. If the phone won't say, it starts fresh. */
export async function readResumeSessionId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(RESUME_SESSION_ID_KEY);
  } catch (error) {
    console.warn("Couldn't read the resume session to go back to; starting fresh", error);
    return null;
  }
}

/** Keeps the session for next time, or forgets it with null. Failing only means it isn't reopened, so it's logged. */
export async function writeResumeSessionId(id: string | null): Promise<void> {
  try {
    if (id) await SecureStore.setItemAsync(RESUME_SESSION_ID_KEY, id);
    else await SecureStore.deleteItemAsync(RESUME_SESSION_ID_KEY);
  } catch (error) {
    console.warn("Couldn't keep the resume session for next time", error);
  }
}
