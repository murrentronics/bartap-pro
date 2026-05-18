/**
 * Cross-platform download utility.
 * - On Android (Capacitor): requests storage permission, writes to Cache,
 *   then opens the native share sheet.
 * - On web: triggers a browser <a> download.
 */

import { Capacitor } from "@capacitor/core";

async function getFilesystem() {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Encoding };
}

async function getShare() {
  const { Share } = await import("@capacitor/share");
  return Share;
}

/** Request storage permission on Android before writing files */
async function requestStoragePermission(): Promise<void> {
  const { Filesystem } = await import("@capacitor/filesystem");
  // Check current permission status
  const status = await Filesystem.checkPermissions();
  if (status.publicStorage !== "granted") {
    const result = await Filesystem.requestPermissions();
    if (result.publicStorage !== "granted") {
      throw new Error("Storage permission denied. Please allow storage access in your device settings.");
    }
  }
}

/** Download a plain-text file */
export async function downloadText(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await requestStoragePermission();
    const { Filesystem, Directory, Encoding } = await getFilesystem();
    const Share = await getShare();
    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({
        title: filename,
        files: [result.uri],
        dialogTitle: "Save or share statement",
      });
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("dismiss")) {
        await Share.share({
          title: filename,
          url: result.uri,
          dialogTitle: "Save or share statement",
        });
      }
    }
  } else {
    const blob = new Blob([content], { type: "text/plain" });
    triggerBrowserDownload(blob, filename);
  }
}

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Request storage permission first — Android requires this at runtime
    await requestStoragePermission();

    const { Filesystem, Directory } = await getFilesystem();
    const Share = await getShare();

    // Strip the data:application/pdf;base64, prefix if present
    const base64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

    if (!base64 || base64.length < 10) {
      throw new Error("PDF generation produced empty output");
    }

    // Write to Cache directory (no extra permission needed on Android 10+)
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    // Open the native share sheet so the user can save/send the PDF
    try {
      await Share.share({
        title: filename,
        files: [result.uri],
        dialogTitle: "Save or share PDF",
      });
    } catch (err: any) {
      const msg = err?.message ?? "";
      // Dismissed share sheet is not an error
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("dismiss")) {
        // Fallback for older Capacitor Share
        try {
          await Share.share({
            title: filename,
            url: result.uri,
            dialogTitle: "Save or share PDF",
          });
        } catch {
          // Share sheet unavailable — file is saved to cache
        }
      }
    }
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
