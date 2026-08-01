/**
 * Client-side background removal using @imgly/background-removal.
 * Runs entirely in the browser via WebAssembly/WebGL — no server, no API key, no cost.
 * The AI model (~40 MB) is fetched from the jsDelivr CDN on first use and then
 * cached by the browser, so subsequent calls are fast.
 */
import { removeBackground as imglyRemoveBg, type Config } from "@imgly/background-removal";

const CONFIG: Config = {
  // "isnet" is the default balanced model for product photos
  model: "isnet",
  output: {
    format: "image/png", // always output PNG so transparency is preserved
    quality: 1,
  },
  // Suppress the default console progress logs
  debug: false,
};

/**
 * Removes the background from an image file.
 * Returns a new PNG File with a transparent background.
 * Falls back to the original file if removal fails.
 */
export async function removeBackground(file: File): Promise<File> {
  const blob = await imglyRemoveBg(file, CONFIG);
  // Replace extension with .png since the output is always a transparent PNG
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.png`, { type: "image/png" });
}
