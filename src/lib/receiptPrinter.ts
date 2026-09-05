/**
 * receiptPrinter.ts — prints a sale receipt to a thermal receipt printer.
 *
 * Supported connection methods:
 *  1. USB via Web Serial API  — shows a device picker listing every USB/serial
 *     device connected to this PC (same style as the HID picker). Works on
 *     Chrome/Edge desktop and Chrome for Android (USB-C OTG).
 *  2. Bluetooth via Web Bluetooth API — paired BLE thermal printer.
 *
 * The cash drawer is wired to the printer's DK port, so `openCashDrawer()` in
 * cashDrawer.ts sends its ESC/POS kick pulse through the same connection.
 *
 * localStorage keys:
 *   bartap-printer-type    -> "usb" | "bt"   (active connection method)
 *   bartap-receipt-vid     -> decimal USB vendor id   (USB path)
 *   bartap-receipt-pid     -> decimal USB product id  (USB path)
 *   bartap-receipt-bt      -> "1"                     (Bluetooth path)
 *   bartap-receipt-bt-name -> device name             (display only)
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

export type PrinterConnectionType = "usb" | "bt" | "none";

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
  return "none";
}

/** Returns true if a printer has been paired (USB via Web Serial or Bluetooth). */
export async function isPrinterPaired(): Promise<boolean> {
  const type = getPrinterConnectionType();
  if (type === "bt") return readStorage("bartap-receipt-bt") === "1";
  // USB — check Web Serial granted ports list
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
 * Pair a USB printer via Web Serial.
 *
 * On both desktop and mobile this shows the browser's native serial device
 * picker — the same style of dialog the barcode scanner uses for HID. The user
 * selects their printer from the list once; subsequent prints reconnect
 * automatically without showing the picker again.
 *
 * If the user cancels (their printer isn't in the list) we return false so the
 * UI stays on the pairing screen and they can try Bluetooth instead.
 */
export async function pairUsbPrinter(): Promise<boolean> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;

  if (!serial?.requestPort) {
    // Web Serial not supported in this browser — nothing to show
    return false;
  }

  try {
    // Empty filters = show every serial/USB-serial device connected to this PC,
    // identical UX to the HID picker in POS Pro's barcode scanner.
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
    // User cancelled the picker — return false so UI stays on pairing screen
    if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("no port selected") || msg.toLowerCase().includes("user cancelled")) {
      return false;
    }
    throw e; // real error — surface it to the caller
  }
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

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Print a receipt using whichever connection the user has paired:
 *  - "bt"  → Web Bluetooth BLE
 *  - "usb" → Web Serial (device picker dialog, same as the HID barcode scanner picker)
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
      return { opened: false, method: "none", error: msg };
    }
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

  // No connection method available — show pairing UI
  return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
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
      return { opened: false, method: "none", needsPairing: true, error: "Bluetooth print failed" };
    }
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

  return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
}
