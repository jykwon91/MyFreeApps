import { File, Paths } from "expo-file-system";
import { DEMO_WELCOME_FILE } from "../../constants/demoWelcome";

const listeners = new Set<() => void>();

function dismissedFile(): File {
  return new File(Paths.document, DEMO_WELCOME_FILE);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** Once per phone and not per workspace or person, as the website remembers it once per browser. */
export function isDemoWelcomeDismissed(): boolean {
  try {
    return dismissedFile().exists;
  } catch {
    return false;
  }
}

/** Best effort: if it can't be saved, the notice comes back next time rather than blocking anything. */
export function dismissDemoWelcome(): void {
  try {
    const file = dismissedFile();
    if (!file.exists) file.create();
    file.write("1");
  } catch (error) {
    console.warn("Couldn't save that the demo notice was seen", error);
  }
  notifyListeners();
}

export function subscribeToDemoWelcome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
