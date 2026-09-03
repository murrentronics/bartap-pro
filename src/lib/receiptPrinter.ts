/**
 * receiptPrinter.ts — prints a sale receipt to a thermal receipt printer.
 *
 * Supported connection methods (tried in order):
 *  1. USB via Web Serial API  — printer shows as a COM port in Device Manager
 *  2. Bluetooth via Web Bluetooth API — paired BLE thermal printer
 *  3. OS system printer via hidden iframe + window.print() — works for any printer
 *     installed in Windows/macOS Printers & Scanners (USB, network, etc.)
 *
 * How method 3 works: most USB thermal printers on Windows install as a
 * standard Windows printer (not a COM port). The browser cannot claim that USB
 * interface directly — Windows kernel owns it. Instead we inject a hidden
 * <iframe> with receipt HTML sized to 80mm paper and call contentWindow.print().
 * The OS print dialog appears once so the user can select their printer; after
 * that, setting it as the default makes every print silent.
 *
 * The cash drawer is wired to the printer's DK port, so `openCashDrawer()` in
 * cashDrawer.ts sends its ESC/POS kick pulse through the same connection.
 *
 * localStorage keys:
 *   bartap-printer-type  -> "usb" | "bt" | "os"   (active connection method)
 *   bartap-receipt-vid   -> decimal USB vendor id   (USB/Web Serial path)
 *   bartap-receipt-pid   -> decimal USB product id  (USB/Web Serial path)
 *   bartap-receipt-bt    -> "1"                     (Bluetooth path)
 *   bartap-receipt-bt-name -> device name           (display only)
 */

const COL_WIDTH = 48;

// ─── ESC/POS BLE service & characteristic UUIDs ──────────────────────────────
// Primary UUIDs (Xprinter, GOOJPRT, iDPRT, most Chinese BLE thermal printers)
const BLE_SERVICE_UUID      = "000018f0-0000-1000-8000-00805f9b34fb";
const BLE_CHAR_UUID         = "00002af1-0000-1000-8000-00805f9b34fb";
// Alternative UUIDs used by some printers (e.g. certain RPP02N / MUNBYN models)
const BLE_SERVICE_UUID_ALT  = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const BLE_CHAR_UUID_ALT     = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
// Chunk size for BLE writes — 20 bytes is universally safe before MTU negotiation
const BLE_CHUNK_SIZE = 20;
// All optional service UUIDs to include in every requestDevice call so the
// browser grants access to them even when not used as a filter.
const ALL_BLE_OPTIONAL = [BLE_SERVICE_UUID, BLE_SERVICE_UUID_ALT];

function esc(b: number): string {
  return String.fromCharCode(b);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  storeName: string;
  locationName?: string;
  orderNumber?: string | number;
  serverName?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  tax?: number;
  total: number;
  paid: number;
  change: number;
  payMode: string;
  customerName?: string;
  date?: string;
}

export type PrinterConnectionType = "usb" | "bt" | "os" | "none";

export interface PrintResult {
  opened: boolean;
  method: string;
  needsPairing?: boolean;
  error?: string;
}

// ─── Web Serial types ─────────────────────────────────────────────────────────

interface WebSerialPort {
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    bufferSize?: number;
  }): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  writable: WritableStream<Uint8Array>;
}

interface WebSerialAPI {
  requestPort(options?: { filters?: { usbVendorId: number }[] }): Promise<WebSerialPort>;
  getPorts(): Promise<WebSerialPort[]>;
}

// ─── Web Bluetooth types ──────────────────────────────────────────────────────

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
  connected: boolean;
  disconnect(): void;
}

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothAPI {
  requestDevice(options: {
    filters?: { services?: string[]; namePrefix?: string }[];
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
  getAvailability(): Promise<boolean>;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// ─── Connection type helpers ──────────────────────────────────────────────────

/** Returns the saved connection type. */
export function getPrinterConnectionType(): PrinterConnectionType {
  const saved = readStorage("bartap-printer-type");
  if (saved === "bt") return "bt";
  if (saved === "usb") return "usb";
  if (saved === "os") return "os";
  return "none";
}

/** Returns true if a printer has been paired (USB, Bluetooth, or OS system printer). */
export async function isPrinterPaired(): Promise<boolean> {
  const type = getPrinterConnectionType();
  if (type === "bt") return readStorage("bartap-receipt-bt") === "1";
  // OS system printer — always ready, no handshake needed
  if (type === "os") return true;
  // USB — check Web Serial granted ports
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.getPorts) return false;
  try {
    const ports = await serial.getPorts();
    return ports.length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true when running on a mobile device or inside the Capacitor native
 * app. Used to decide which USB pairing strategy to try first.
 */
function isMobileOrNative(): boolean {
  // Capacitor sets a custom UA suffix; also catches Android/iOS browsers
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|capacitor/i.test(navigator.userAgent);
}

/**
 * Pair a USB printer.
 *
 * Strategy depends on platform:
 *
 * Desktop browser (Windows/macOS):
 *   → Try OS print dialog first (silent iframe, works for any installed printer)
 *   → Only fall back to Web Serial COM picker if the user explicitly requests it
 *      (they would need to "Change printer" and select a COM port device)
 *
 * Mobile / Capacitor native app:
 *   → Try Web Serial COM picker first (USB-C OTG)
 *   → Fall back to OS print dialog if Web Serial isn't available or user cancels
 */
export async function pairUsbPrinter(): Promise<boolean> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  const mobile = isMobileOrNative();

  // ── Desktop: OS system printer is the primary path ─────────────────────────
  if (!mobile) {
    // Mark as "os" immediately — the iframe print path works for every printer
    // installed in Windows/macOS Printers & Scanners with no further setup.
    // If the user's printer is a serial/COM device they can tap "Change printer"
    // and re-pair via the COM picker (which shows when type is already "usb").
    writeStorage("bartap-printer-type", "os");
    removeStorage("bartap-receipt-bt");
    removeStorage("bartap-receipt-bt-name");
    removeStorage("bartap-receipt-vid");
    removeStorage("bartap-receipt-pid");
    return true;
  }

  // ── Mobile / Native: Web Serial (USB-C OTG) is the primary path ────────────
  if (serial?.requestPort) {
    try {
      const port = await serial.requestPort();
      const info = port.getInfo();
      if (info.usbVendorId != null) writeStorage("bartap-receipt-vid", String(info.usbVendorId));
      if (info.usbProductId != null) writeStorage("bartap-receipt-pid", String(info.usbProductId));
      writeStorage("bartap-printer-type", "usb");
      removeStorage("bartap-receipt-bt");
      removeStorage("bartap-receipt-bt-name");
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // User cancelled the picker — fall through to OS mode
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("no port selected")) {
        throw e; // real error, surface it
      }
    }
  }

  // Fallback for mobile when Web Serial isn't available or was cancelled
  writeStorage("bartap-printer-type", "os");
  removeStorage("bartap-receipt-bt");
  removeStorage("bartap-receipt-bt-name");
  removeStorage("bartap-receipt-vid");
  removeStorage("bartap-receipt-pid");
  return true;
}

/**
 * Pair a Bluetooth printer via Web Bluetooth.
 * Opens the browser Bluetooth picker. On mobile, shows ALL nearby devices
 * since most thermal printers don't advertise the standard ESC/POS service UUID.
 */
export async function pairBluetoothPrinter(): Promise<boolean> {
  const bt = (navigator as unknown as { bluetooth?: BluetoothAPI }).bluetooth;
  if (!bt?.requestDevice) return false;
  try {
    // Use acceptAllDevices so every nearby BT/BLE device appears in the picker —
    // most thermal printers don't broadcast the standard ESC/POS service UUID
    // in their advertising packets, so a filter-based scan shows an empty list.
    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ALL_BLE_OPTIONAL,
    });
    if (!device) return false;
    writeStorage("bartap-printer-type", "bt");
    writeStorage("bartap-receipt-bt", "1");
    if (device.name) writeStorage("bartap-receipt-bt-name", device.name);
    removeStorage("bartap-receipt-vid");
    removeStorage("bartap-receipt-pid");
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // User cancelled the picker — not an error worth surfacing
    if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user cancelled") || msg.toLowerCase().includes("chooser")) {
      return false;
    }
    // Rethrow real errors (BT unavailable, permission denied, etc.) so the
    // caller can show a meaningful message instead of silently failing
    throw e;
  }
}

/**
 * Legacy alias — kept for backward-compat with callers in CreditPage,
 * ManagerPage, wallet.tsx that import `pairPrinter`.
 */
export async function pairPrinter(): Promise<boolean> {
  const type = getPrinterConnectionType();
  if (type === "bt") return pairBluetoothPrinter();
  return pairUsbPrinter();
}

// ─── ESC/POS receipt builder ──────────────────────────────────────────────────

function buildReceiptEscPos(data: ReceiptData): Uint8Array {
  const cmds: string[] = [];

  cmds.push(esc(0x1b) + esc(0x40));                   // Reset
  cmds.push(esc(0x1b) + esc(0x61) + esc(0x01));       // Center

  cmds.push(center(data.storeName || "My Business", true));
  if (data.locationName) cmds.push(center(data.locationName));

  const dateStr =
    data.date ||
    new Date().toLocaleString("en-US", {
      month: "numeric", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
    });
  cmds.push(center(dateStr));
  cmds.push(center(data.serverName ? `Served by ${data.serverName}` : "Served by Staff"));
  cmds.push(hr());

  // ORDER # — double size, bold, centred
  cmds.push(esc(0x1b) + esc(0x61) + esc(0x01));
  cmds.push(esc(0x1d) + esc(0x21) + esc(0x11));       // Double width+height
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x01));       // Bold ON
  cmds.push(`ORDER #${data.orderNumber ?? 1}`);
  cmds.push(esc(0x1d) + esc(0x21) + esc(0x00));       // Reset size
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x00));       // Bold OFF
  cmds.push(hr());

  cmds.push(esc(0x1b) + esc(0x61) + esc(0x00));       // Left align
  for (const it of data.items) {
    const qtyPrefix = `${it.qty}x `;
    const priceStr  = `$${(it.qty * it.price).toFixed(2)}`;
    const maxName   = COL_WIDTH - qtyPrefix.length - priceStr.length;
    cmds.push(`${qtyPrefix}${padRight(it.name, Math.max(1, maxName))}${priceStr}`);
  }
  cmds.push(hr());

  const subtotalStr = `$${data.subtotal.toFixed(2)}`;
  cmds.push(`${padRight("Subtotal", COL_WIDTH - subtotalStr.length)}${subtotalStr}`);
  if (data.tax != null && data.tax > 0) {
    const taxStr = `$${data.tax.toFixed(2)}`;
    cmds.push(`${padRight("Tax", COL_WIDTH - taxStr.length)}${taxStr}`);
  }
  const totalStr = `$${data.total.toFixed(2)}`;
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x01));
  cmds.push(`${padRight("Total", COL_WIDTH - totalStr.length)}${totalStr}`);
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x00));
  cmds.push(hr());

  const payLabel  = data.payMode === "credit" ? "Credit" : "Cash Tendered";
  const paidStr   = `$${data.paid.toFixed(2)}`;
  const changeStr = `$${data.change.toFixed(2)}`;
  cmds.push(`${padRight(payLabel, COL_WIDTH - paidStr.length)}${paidStr}`);
  cmds.push(`${padRight("Change", COL_WIDTH - changeStr.length)}${changeStr}`);

  if (data.customerName) {
    cmds.push(hr());
    cmds.push(`Customer: ${data.customerName}`);
  }

  cmds.push(hr());
  cmds.push(center("Thank you for your purchase!"));
  cmds.push(esc(0x1b) + esc(0x64) + esc(0x03));       // Feed 3 lines
  cmds.push(esc(0x1d) + esc(0x56) + esc(0x42) + esc(0x00)); // Full cut

  const raw = cmds.join("\n");
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

function center(text: string, bold = false): string {
  const on  = bold ? esc(0x1b) + esc(0x45) + esc(0x01) : "";
  const off = bold ? esc(0x1b) + esc(0x45) + esc(0x00) : "";
  const padded = text.padStart(Math.floor((COL_WIDTH + text.length) / 2)).slice(0, COL_WIDTH);
  return `${on}${padded}${off}`;
}

function hr(): string { return "\u2500".repeat(COL_WIDTH); }

function padRight(s: string, w: number): string { return s.padEnd(w).slice(0, w); }

// ─── USB (Web Serial) print path ──────────────────────────────────────────────

async function printViaWebSerial(bytes: Uint8Array): Promise<PrintResult> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.requestPort) {
    return { opened: false, method: "none", error: "Web Serial not supported in this browser" };
  }

  const vid = parseInt(readStorage("bartap-receipt-vid") ?? "", 10);

  let port: WebSerialPort | undefined;
  try {
    const granted = await serial.getPorts();
    port = Number.isFinite(vid) && vid > 0
      ? (granted.find((p) => p.getInfo().usbVendorId === vid) ?? granted[0])
      : granted[0];
  } catch { /* ignore */ }

  if (!port) {
    const filters = Number.isFinite(vid) && vid > 0 ? [{ usbVendorId: vid }] : undefined;
    port = await serial.requestPort(filters ? { filters } : undefined);
  }

  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });

  try {
    const writer = port.writable.getWriter();
    await writer.write(bytes);
    writer.releaseLock();
  } finally {
    await new Promise((r) => setTimeout(r, 200));
    await port.close().catch(() => undefined);
  }

  // Persist VID after a successful print so future calls skip the picker
  try {
    const info = port.getInfo();
    if (info.usbVendorId != null) writeStorage("bartap-receipt-vid", String(info.usbVendorId));
    if (info.usbProductId != null) writeStorage("bartap-receipt-pid", String(info.usbProductId));
  } catch { /* ignore */ }

  writeStorage("bartap-printer-type", "usb");
  return { opened: true, method: "webserial" };
}

// ─── Bluetooth (Web Bluetooth) print path ─────────────────────────────────────

async function printViaBluetooth(bytes: Uint8Array): Promise<PrintResult> {
  const bt = (navigator as unknown as { bluetooth?: BluetoothAPI }).bluetooth;
  if (!bt?.requestDevice) {
    return {
      opened: false, method: "none",
      error: "Web Bluetooth not available — use Chrome on desktop or Android",
    };
  }

  // ── Step 1: try to silently reconnect to the previously paired device ──────
  // `getDevices()` returns devices the user already granted access to.
  // This avoids showing the picker again on every print.
  let device: BluetoothDevice | undefined;
  const savedName = readStorage("bartap-receipt-bt-name");
  if (bt.getDevices) {
    try {
      const granted = await bt.getDevices();
      if (granted.length > 0) {
        device = savedName
          ? (granted.find((d) => d.name === savedName) ?? granted[0])
          : granted[0];
      }
    } catch { /* ignore — fall through to requestDevice */ }
  }

  // ── Step 2: if no cached device, show the picker ───────────────────────────
  // Use acceptAllDevices=true — most thermal printers don't advertise the
  // standard ESC/POS service UUID in their advertising packets, so a filter
  // scan returns an empty list.
  if (!device) {
    device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ALL_BLE_OPTIONAL,
    });
  }

  if (!device.gatt) {
    return { opened: false, method: "none", error: "Bluetooth device has no GATT server" };
  }

  const server = await device.gatt.connect();

  // ── Step 3: find the writable characteristic ───────────────────────────────
  // Try the primary UUID first, then the alternative UUID used by some brands.
  let characteristic: BluetoothRemoteGATTCharacteristic | undefined;
  for (const [svcUuid, charUuid] of [
    [BLE_SERVICE_UUID, BLE_CHAR_UUID],
    [BLE_SERVICE_UUID_ALT, BLE_CHAR_UUID_ALT],
  ] as const) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      characteristic = await svc.getCharacteristic(charUuid);
      break;
    } catch { /* try next UUID pair */ }
  }

  if (!characteristic) {
    server.disconnect();
    return {
      opened: false, method: "none",
      error: "Printer does not expose a known ESC/POS BLE service — check printer model compatibility",
    };
  }

  // Write in 20-byte chunks (safe MTU for all BLE versions)
  for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + BLE_CHUNK_SIZE);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    // Small delay between chunks to avoid buffer overrun on slower printers
    await new Promise((r) => setTimeout(r, 10));
  }

  server.disconnect();

  // Remember BT pairing
  writeStorage("bartap-printer-type", "bt");
  writeStorage("bartap-receipt-bt", "1");
  if (device.name) writeStorage("bartap-receipt-bt-name", device.name);

  return { opened: true, method: "bluetooth" };
}

// ─── OS system printer — hidden iframe + window.print() ──────────────────────
//
// When the printer is installed as a Windows/macOS system printer (shows in
// Printers & Scanners, not as a COM port), the browser cannot send raw ESC/POS
// bytes directly — the OS kernel driver owns that USB interface. Instead we
// inject a hidden <iframe> with receipt HTML and call iframe.contentWindow.print().
// The OS print dialog appears; the user picks their printer once. On subsequent
// prints, if the printer is set as default, Chrome remembers the last-used
// printer per-origin and the dialog is skipped automatically.
//
// Receipt HTML is sized to 80mm thermal paper with @page media so the output
// looks identical to what the Web Serial ESC/POS path produces.

function buildReceiptHtml(data: ReceiptData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const itemRows = data.items.map((it) =>
    `<tr>
      <td class="name">${it.qty}x ${esc(it.name)}</td>
      <td class="price">$${(it.qty * it.price).toFixed(2)}</td>
    </tr>`
  ).join("");

  const taxRow = (data.tax != null && data.tax > 0)
    ? `<tr><td>Tax</td><td class="r">$${data.tax.toFixed(2)}</td></tr>` : "";

  const customerRow = data.customerName
    ? `<tr><td colspan="2" class="customer">Customer: ${esc(data.customerName)}</td></tr>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page { size: 80mm auto; margin: 4mm 2mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #000;
  width: 76mm;
}
.center { text-align: center; }
.store { font-size: 15px; font-weight: 900; text-transform: uppercase;
         font-family: Arial, sans-serif; margin-bottom: 1mm; }
.sub { font-size: 10px; color: #333; margin-bottom: 0.5mm; }
hr { border: none; border-top: 1px dashed #555; margin: 2mm 0; }
.order { font-size: 18px; font-weight: 900; text-transform: uppercase;
         letter-spacing: 0.5mm; text-align: center; margin: 2mm 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 0.8mm 0; vertical-align: top; }
.name { text-align: left; }
.price { text-align: right; white-space: nowrap; }
.r { text-align: right; }
.total-row { font-size: 13px; font-weight: 900; }
.customer { padding-top: 1mm; font-size: 11px; }
</style>
</head><body>
<div class="center store">${esc(data.storeName || "My Business")}</div>
${data.locationName ? `<div class="center sub">${esc(data.locationName)}</div>` : ""}
<div class="center sub">${esc(data.date || "")}</div>
<div class="center sub">Served by ${esc(data.serverName || "Staff")}</div>
<hr>
<div class="order">ORDER #${data.orderNumber || 1}</div>
<hr>
<table><tbody>${itemRows}</tbody></table>
<hr>
<table><tbody>
  <tr><td>Subtotal</td><td class="r">$${data.subtotal.toFixed(2)}</td></tr>
  ${taxRow}
  <tr class="total-row"><td>Total</td><td class="r">$${data.total.toFixed(2)}</td></tr>
</tbody></table>
<hr>
<table><tbody>
  <tr><td>${data.payMode === "credit" ? "Credit" : "Cash Tendered"}</td>
      <td class="r">$${data.paid.toFixed(2)}</td></tr>
  <tr><td>Change</td><td class="r">$${data.change.toFixed(2)}</td></tr>
  ${customerRow}
</tbody></table>
</body></html>`;
}

/**
 * Print via the OS print dialog using a hidden iframe.
 * Works for any printer installed in Windows/macOS Printers & Scanners.
 * No popup tab — the iframe is 0×0 and removed after printing.
 */
function printViaSilentIframe(data: ReceiptData): PrintResult {
  try {
    const html = buildReceiptHtml(data);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return { opened: false, method: "none", error: "Could not create print frame" };
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Wait for resources to load before triggering print
    const doprint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // Remove iframe after a short delay so the print dialog has time to open
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch { /* already removed */ }
        }, 2000);
      }
    };

    if (iframe.contentDocument?.readyState === "complete") {
      doprint();
    } else {
      iframe.onload = doprint;
    }

    writeStorage("bartap-printer-type", "os");
    return { opened: true, method: "os-print" };
  } catch (e) {
    return { opened: false, method: "none", error: e instanceof Error ? e.message : "Print failed" };
  }
}

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Print a receipt using whichever connection the user has paired:
 *  - "os"  → hidden iframe + window.print() (OS system printer, any installed printer)
 *  - "bt"  → Web Bluetooth BLE
 *  - "usb" → Web Serial (COM port, USB-C OTG on mobile)
 *  - none  → returns needsPairing:true so the UI shows the pairing buttons
 */
export async function printReceipt(data: ReceiptData): Promise<PrintResult> {
  const dateStr = data.date || new Date().toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const fullData: ReceiptData = { ...data, date: dateStr };
  const bytes = buildReceiptEscPos(fullData);
  const type  = getPrinterConnectionType();

  // ── Bluetooth path ─────────────────────────────────────────────────────────
  if (type === "bt") {
    try {
      return await printViaBluetooth(bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user cancelled")) {
        return { opened: false, method: "none", needsPairing: true, error: msg };
      }
      // BT failed — fall through to OS print dialog
      return printViaSilentIframe(fullData);
    }
  }

  // ── OS system printer path (Windows/macOS Printers & Scanners) ─────────────
  if (type === "os") {
    return printViaSilentIframe(fullData);
  }

  // ── USB / Web Serial path ──────────────────────────────────────────────────
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (serial?.requestPort) {
    try {
      const granted = await serial.getPorts();
      if (granted.length === 0) {
        return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
      }
    } catch { /* proceed */ }
    try {
      return await printViaWebSerial(bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancelled") || msg.includes("No port")) {
        return { opened: false, method: "none", needsPairing: true, error: msg };
      }
      return { opened: false, method: "none", error: msg };
    }
  }

  // ── Final fallback — OS print dialog via iframe ────────────────────────────
  return printViaSilentIframe(fullData);
}

/**
 * Print a receipt AND immediately send the cash-drawer kick pulse through the
 * same connection in a single open/close cycle (USB) or sequential BLE writes.
 * This avoids opening the serial port twice when the "Print" button is tapped.
 */
export async function printReceiptAndOpenDrawer(
  data: ReceiptData,
  drawerPulse: Uint8Array = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0x19]),
): Promise<PrintResult> {
  const dateStr = data.date || new Date().toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const fullData: ReceiptData = { ...data, date: dateStr };
  const receiptBytes = buildReceiptEscPos(fullData);
  // Concatenate receipt bytes + drawer pulse into one buffer
  const combined = new Uint8Array(receiptBytes.length + drawerPulse.length);
  combined.set(receiptBytes, 0);
  combined.set(drawerPulse, receiptBytes.length);

  const type = getPrinterConnectionType();

  if (type === "bt") {
    try {
      return await printViaBluetooth(combined);
    } catch {
      return printViaSilentIframe(fullData); // drawer won't open but receipt still prints
    }
  }

  if (type === "os") {
    return printViaSilentIframe(fullData);
  }

  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (serial?.requestPort) {
    try {
      const granted = await serial.getPorts();
      if (granted.length === 0) {
        return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
      }
    } catch { /* proceed */ }
    try {
      return await printViaWebSerial(combined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { opened: false, method: "none", error: msg };
    }
  }

  return printViaSilentIframe(fullData);
}
