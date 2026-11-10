import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/** How far up from the bottom the on-screen keyboard reaches, or 0 when it is down. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}
