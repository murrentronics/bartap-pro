/**
 * Cross-platform download utility.
 *
 * On Android (Capacitor): writes to the Downloads directory using
 * @capacitor/filesystem, then opens it via the Share sheet.
 *
 * On web: triggers a standard browser <a> download.
 */

import { Capacitor } from "@capacitor/core";

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");

  if (!base64 || base64.length < 10) {
    throw new Error("PDF generation produced empty output");
  }

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    // Write to cache directory first (no extra permissions needed)
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    // Open share sheet so user can save to Downloads, WhatsApp, etc.
    await Share.share({
      title: filename,
      url: writeResult.uri,
      dialogTitle: "Save or share PDF",
    });
  } else {
    // Web: decode base64 and trigger <a> download
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
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    const base64 = btoa(unescape(encodeURIComponent(content)));
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      url: writeResult.uri,
      dialogTitle: "Save or share file",
    });
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
