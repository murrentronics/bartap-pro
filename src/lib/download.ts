/**
 * Cross-platform download utility.
 *
 * On Android (Capacitor): uses the native PdfDownloadPlugin which calls
 * Android's DownloadManager — gives you the status bar progress notification,
 * "Download complete" toast, and tap-to-open in the Downloads folder.
 *
 * On web: triggers a standard browser <a> download.
 */

import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";

interface PdfDownloadPlugin {
  downloadPdf(options: { base64: string; filename: string }): Promise<void>;
}

// Register our native plugin
const PdfDownload = registerPlugin<PdfDownloadPlugin>("PdfDownload");

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Strip data URI prefix if present — plugin handles it too but be safe
    const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");

    if (!base64 || base64.length < 10) {
      throw new Error("PDF generation produced empty output");
    }

    // Native plugin → DownloadManager → status bar notification + Downloads folder
    await PdfDownload.downloadPdf({ base64, filename });
  } else {
    // Web: decode base64 and trigger <a> download
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
    // Convert text to base64 and reuse the same native plugin
    const base64 = btoa(unescape(encodeURIComponent(content)));
    await PdfDownload.downloadPdf({ base64, filename });
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
