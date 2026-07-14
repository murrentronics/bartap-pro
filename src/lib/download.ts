import { Capacitor } from "@capacitor/core";

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
  if (!base64 || base64.length < 10) throw new Error("PDF generation produced empty output");

  if (Capacitor.isNativePlatform()) {
    // Write to Cache then share — avoids EACCES on Android 10+ (no WRITE_EXTERNAL_STORAGE needed)
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: filename, url: result.uri, dialogTitle: "Save PDF" });
  } else {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const url   = URL.createObjectURL(blob);

    // Safari on iOS doesn't support <a download> — open in new tab instead
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isSafari || isIOS) {
      window.open(url, "_blank");
      // Revoke after a short delay to allow the new tab to load
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      Object.assign(document.createElement("a"), { href: url, download: filename }).click();
      URL.revokeObjectURL(url);
    }
  }
}

/** Download a plain-text file */
export async function downloadText(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = btoa(unescape(encodeURIComponent(content)));
    const result = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache, recursive: true });
    await Share.share({ title: filename, url: result.uri, dialogTitle: "Save file" });
  } else {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  }
}
