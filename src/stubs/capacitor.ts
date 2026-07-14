/**
 * Capacitor stub for the web build.
 * All Capacitor plugin imports resolve to this file on the web build.
 * Everything is a no-op so the app works normally in Safari/browser.
 */

// @capacitor/core
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => "web",
  isPluginAvailable: () => false,
};

// Generic plugin stub — all methods return a resolved promise
const noop = () => Promise.resolve();
const noopHandler = { addListener: () => ({ remove: noop }), removeAllListeners: noop };

// Push / Local Notifications
export const PushNotifications = { ...noopHandler, requestPermissions: noop, register: noop, createChannel: noop };
export const LocalNotifications = { ...noopHandler, requestPermissions: noop, schedule: noop, createChannel: noop };

// Filesystem
export const Filesystem = { writeFile: noop, readFile: noop, deleteFile: noop };

// Clipboard
export const Clipboard = { write: noop, read: () => Promise.resolve({ type: "text/plain", value: "" }) };

// Share
export const Share = { share: noop, canShare: () => Promise.resolve({ value: false }) };

// Camera
export const Camera = { getPhoto: noop, requestPermissions: noop };

// Browser
export const Browser = { open: noop, close: noop };

// FileOpener
export const FileOpener = { open: noop };

// Default export covers any import styles
export default {
  Capacitor, PushNotifications, LocalNotifications,
  Filesystem, Clipboard, Share, Camera, Browser, FileOpener,
};
