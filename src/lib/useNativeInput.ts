import { Capacitor } from "@capacitor/core";

/**
 * Returns input props for fields that have a custom in-app numpad/keypad.
 *
 * - On native (Android/iOS): readOnly=true so the device keyboard never pops up.
 *   The custom numpad handles all input.
 * - On web/desktop: normal editable input — keyboard and mouse work as expected.
 */
export function useNativeInput() {
  const isNative = Capacitor.isNativePlatform();
  return {
    // Apply these props to any <input> that has a custom numpad
    numpadInputProps: {
      readOnly: isNative,
      // Prevent caret/focus outline on native since it's display-only there
      style: isNative ? { caretColor: "transparent" } as React.CSSProperties : undefined,
    } as React.InputHTMLAttributes<HTMLInputElement>,
    isNative,
  };
}
