/**
 * Cross-platform download utility.
 * - On Android (Capacitor): saves PDF directly to the Downloads folder.
 * - On web: triggers a browser <a> download.
 */

import { Capacitor } from "@capacitor/core";

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");

    // Strip the data URI prefix if present
    const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");

    if (!base64 || base64.length < 10) {
      throw new Error("PDF generation produced empty output");
    }

    // Request storage permission (needed on Android 9 and below)
    const permStatus = await Filesystem.checkPermissions();
    if (permStatus.publicStorage !== "granted") {
      const request = await Filesystem.requestPermissions();
      if (request.publicStorage !== "granted") {
        throw new Error("Storage permission denied — please allow storage access in Settings.");
      }
    }

    // Try saving to the public Downloads folder first (visible in Files app)
    // Falls back to Documents if ExternalStorage isn't available
    try {
      await Filesystem.writeFile({
        path: `Download/${filename}`,
        data: base64,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
    } catch {
      // Fallback to Documents directory
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });
    }
  } else {
    // Web: decode base64 and trigger download
    const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Download a plain-text file */
export async function downloadText(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");

    try {
      await Filesystem.writeFile({
        path: `Download/${filename}`,
        data: content,
        directory: Directory.ExternalStorage,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    } catch {
      await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    }
  } else {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
