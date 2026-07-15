import { Capacitor } from "@capacitor/core";

/** Download a PDF file.
 *  - Android native: write to cache + share sheet
 *  - Web/desktop: create blob URL → download or open new tab (Safari)
 *  Accepts either a base64 data URI string OR a jsPDF doc instance.
 */
export async function downloadPdf(filename: string, pdfBase64: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Android: strip prefix, write base64 to cache, share
    const base64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
    if (!base64 || base64.length < 10) throw new Error("PDF generation produced empty output");
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
    // Web: decode base64 safely without atob on the full string
    const dataUri = pdfBase64;
    let blob: Blob;

    if (dataUri.startsWith("data:")) {
      // Parse data URI manually — safer than atob on large strings
      const [, b64] = dataUri.split(",");
      if (!b64) throw new Error("PDF generation produced empty output");
      const binStr = atob(b64);
      const bytes  = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      blob = new Blob([bytes], { type: "application/pdf" });
    } else {
      throw new Error("PDF generation produced unexpected output");
    }

    const url = URL.createObjectURL(blob);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isSafari || isIOS) {
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
