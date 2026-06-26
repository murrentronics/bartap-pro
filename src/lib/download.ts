import { Capacitor } from "@capacitor/core";

/** Download a PDF file (base64 data URI from jsPDF) */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
  if (!base64 || base64.length < 10) throw new Error("PDF generation produced empty output");

  if (Capacitor.isNativePlatform()) {
    // Save directly to the device Documents folder — no share sheet
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
  } else {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
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
