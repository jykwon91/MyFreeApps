/** Stands in for expo-secure-store, so a test can see and seed what the phone keeps. */
export const storedItems = new Map<string, string>();

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY";

export async function getItemAsync(key: string): Promise<string | null> {
  return storedItems.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  storedItems.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  storedItems.delete(key);
}
