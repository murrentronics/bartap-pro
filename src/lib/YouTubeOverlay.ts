/**
 * YouTubeOverlay — JS bridge to the native YouTubeOverlayPlugin.
 *
 * On Android: uses the native WebView overlay (full YouTube, audio persists).
 * On web/dev:  falls back to window.open so development still works.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface YouTubeOverlayPlugin {
  initialise(): Promise<void>;
  open(options: { url: string }): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  getState(): Promise<{ visible: boolean; initialised: boolean }>;
}

// Register the plugin — name must match @CapacitorPlugin(name = "YouTubeOverlay")
const NativeOverlay = registerPlugin<YouTubeOverlayPlugin>("YouTubeOverlay");

const isNative = Capacitor.isNativePlatform();

export const YouTubeOverlay = {
  /**
   * Call once when the music feature is first enabled.
   * Loads m.youtube.com in the background so it's ready instantly.
   */
  async init(): Promise<void> {
    if (!isNative) return;
    try {
      await NativeOverlay.initialise();
      await NativeOverlay.open({ url: "https://m.youtube.com" });
    } catch (e) {
      console.warn("[YouTubeOverlay] init failed:", e);
    }
  },

  /**
   * Bring the YouTube WebView to the front.
   * On web: opens m.youtube.com in a new tab (dev fallback).
   */
  async show(): Promise<void> {
    if (!isNative) {
      window.open("https://m.youtube.com", "_blank");
      return;
    }
    try {
      await NativeOverlay.show();
    } catch (e) {
      console.warn("[YouTubeOverlay] show failed:", e);
    }
  },

  /**
   * Push the YouTube WebView behind the app.
   * Audio keeps playing — the WebView is hidden, not destroyed.
   */
  async hide(): Promise<void> {
    if (!isNative) return;
    try {
      await NativeOverlay.hide();
    } catch (e) {
      console.warn("[YouTubeOverlay] hide failed:", e);
    }
  },

  /**
   * Returns whether the overlay is currently visible.
   */
  async isVisible(): Promise<boolean> {
    if (!isNative) return false;
    try {
      const state = await NativeOverlay.getState();
      return state.visible;
    } catch {
      return false;
    }
  },
};
