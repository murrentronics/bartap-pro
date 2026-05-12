/**
 * Cross-platform download utility.
 * - On Android (Capacitor): uses @capacitor/filesystem to save to Downloads,
 *   then @capacitor/share to open the share sheet.
 * - On web: triggers a browser <a> download.
 */

import { Capacitor } from "@capacitor/core";

// Lazy-load Capacitor plugins only when running natively
async function getFilesystem() {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Encoding };
}

async function getShare() {
  const { Share } = await import("@capacitor/share");
  return Share;
}

/** Download a plain-text file */
export async function downloadText(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await getFilesystem();
    const Share = await getShare();
    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: filename,
      url: result.uri,
      dialogTitle: "Save or share statement",
    });
  } else {
    const blob = new Blob([content], { type: "text/plain" });
    triggerBrowserDownload(blob, filename);
  }
}

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await getFilesystem();
    const Share = await getShare();
    // Strip the data:application/pdf;base64, prefix if present
    const base64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: filename,
      url: result.uri,
      dialogTitle: "Save or share PDF",
    });
  } else {
    const byteChars = atob(pdfBase64.replace(/^data:application\/pdf;base64,/, ""));
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    triggerBrowserDownload(blob, filename);
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
