/**
 * cashDrawer.ts — POS cash drawer integration.
 *
 * The cash drawer is physically wired to the receipt printer via the printer's
 * RJ11/RJ45 DK port. The printer is the only connection to the device — both
 * receipt printing and drawer-open commands travel through it.
 *
 * `openCashDrawer()` sends an ESC/POS kick pulse through whichever connection
 * the printer is using:
 *  - USB (Web Serial API) — same port as the receipt printer
 *  - Bluetooth (Web Bluetooth BLE) — same GATT characteristic as the printer
 *  - Native Capacitor plugin — Android USB Host on the installed APK
 *
 * Supported hardware topologies:
 *  - USB printer → desktop/laptop (USB-A or USB-C)
 *  - USB printer → Android phone/tablet (USB-C OTG, Chrome for Android or APK)
 *  - Bluetooth printer → any device with Web Bluetooth (Chrome desktop/Android)
 *  - Cash drawer is ALWAYS driven through the printer — no separate cable.
 *
 * localStorage key:
 *   bartap-drawer-pulse  -> hex ESC/POS bytes, e.g. "1b70001919" (optional override)
 *   (VID/PID/BT state shared with receiptPrinter via bartap-receipt-* keys)
 */

import { Capacitor } from "@capacitor/core";

// Inlined here to avoid a circular dependency with receiptPrinter.ts.
// Both files need to know the active connection type; reading from localStorage
// directly is simpler than a shared module.
function getPrinterConnectionType(): "usb" | "bt" | "none" {
  try {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("bartap-printer-type") : null;
    if (saved === "bt") return "bt";
    if (saved === "usb") return "usb";
    return "none";
  } catch {
    return "none";
  }
}

export type CashDrawerMethod = "native" | "webserial" | "bluetooth" | "none";

export interface CashDrawerResult {
  opened: boolean;
  method: CashDrawerMethod;
  device?: string;
  error?: string;
}

export interface CashDrawerOptions {
  /** Override the ESC/POS pulse bytes (hex string, e.g. "1b70001919"). */
  pulseHex?: string;
}

// ─── ESC/POS BLE UUIDs — must match receiptPrinter.ts ────────────────────────
const BLE_SERVICE_UUID     = "000018f0-0000-1000-8000-00805f9b34fb";
const BLE_CHAR_UUID        = "00002af1-0000-1000-8000-00805f9b34fb";
const BLE_SERVICE_UUID_ALT = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const BLE_CHAR_UUID_ALT    = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
const BLE_CHUNK_SIZE       = 20;
const ALL_BLE_OPTIONAL     = [BLE_SERVICE_UUID, BLE_SERVICE_UUID_ALT];

// ─── Types ────────────────────────────────────────────────────────────────────

type NativeCashDrawerApi = {
  open: (opts: { pulseHex: string; vid: number | null; pid: number | null }) => Promise<CashDrawerResult>;
};

interface WebSerialPort {
  open(options: {
    baudRate: number; dataBits?: number; stopBits?: number;
    parity?: string; bufferSize?: number;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ESC/POS "open cash drawer pin 2": ESC p 0 t1 t2 = 1B 70 00 19 19 */
const DEFAULT_PULSE: number[] = [0x1b, 0x70, 0x00, 0x19, 0x19];
const DEFAULT_PULSE_HEX = "1b70001919";

function readStorage(key: string): string | null {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; }
  catch { return null; }
}

function parsePulseHex(hex: string | null | undefined): number[] {
  const pairs = (hex ?? "").replace(/\s+/g, "").match(/[0-9a-fA-F]{2}/g);
  if (!pairs || pairs.length === 0) return DEFAULT_PULSE;
  return pairs.map((h) => parseInt(h, 16));
}

function resolvePulse(opts?: CashDrawerOptions): Uint8Array {
  const bytes = parsePulseHex(
    opts?.pulseHex ?? readStorage("bartap-drawer-pulse") ?? DEFAULT_PULSE_HEX,
  );
  return new Uint8Array(bytes);
}

// ─── Native Capacitor path ────────────────────────────────────────────────────

function openViaNative(pulse: Uint8Array): Promise<CashDrawerResult> {
  const plugins = (Capacitor as unknown as { Plugins?: Record<string, Record<string, CallableFunction>> }).Plugins;
  const api = plugins?.CashDrawer as unknown as NativeCashDrawerApi | null;
  if (!api?.open) {
    return Promise.resolve({
      opened: false, method: "none" as CashDrawerMethod,
      error: "CashDrawer native plugin not registered — rebuild the Android app",
    });
  }
  const vid = parseInt(readStorage("bartap-receipt-vid") ?? "", 10);
  const pid = parseInt(readStorage("bartap-receipt-pid") ?? "", 10);
  return api.open({
    pulseHex: [...pulse].map((b) => b.toString(16).padStart(2, "0")).join(""),
    vid: Number.isFinite(vid) && vid > 0 ? vid : null,
    pid: Number.isFinite(pid) && pid > 0 ? pid : null,
  });
}

// ─── USB / Web Serial path ────────────────────────────────────────────────────

async function openViaWebSerial(pulse: Uint8Array): Promise<CashDrawerResult> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.requestPort) {
    return {
      opened: false, method: "none",
      error: "Web Serial not available — use Chrome/Edge desktop or Chrome for Android (USB-C OTG)",
    };
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
    // Printer not yet paired — prompt the user
    const filters = Number.isFinite(vid) && vid > 0 ? [{ usbVendorId: vid }] : undefined;
    port = await serial.requestPort(filters ? { filters } : undefined);
    try {
      const info = port.getInfo();
      if (info.usbVendorId != null) localStorage.setItem("bartap-receipt-vid", String(info.usbVendorId));
      if (info.usbProductId != null) localStorage.setItem("bartap-receipt-pid", String(info.usbProductId));
    } catch { /* best-effort */ }
  }

  let device: string | undefined;
  try {
    const info = port.getInfo();
    if (info.usbVendorId != null) device = `VID ${info.usbVendorId}`;
  } catch { /* best-effort */ }

  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });
  const writer = port.writable.getWriter();
  try {
    await writer.write(pulse);
  } finally {
    writer.releaseLock();
  }
  await new Promise((r) => setTimeout(r, 150));
  await port.close().catch(() => undefined);

  return { opened: true, method: "webserial", device };
}

// ─── Bluetooth path ───────────────────────────────────────────────────────────

async function openViaBluetooth(pulse: Uint8Array): Promise<CashDrawerResult> {
  const bt = (navigator as unknown as { bluetooth?: BluetoothAPI }).bluetooth;
  if (!bt?.requestDevice) {
    return {
      opened: false, method: "none",
      error: "Web Bluetooth not available — use Chrome on desktop or Android",
    };
  }

  // Try to reconnect to the previously paired device silently first
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
    } catch { /* ignore */ }
  }

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

  // Try both known UUID pairs
  let char: BluetoothRemoteGATTCharacteristic | undefined;
  for (const [svcUuid, charUuid] of [
    [BLE_SERVICE_UUID, BLE_CHAR_UUID],
    [BLE_SERVICE_UUID_ALT, BLE_CHAR_UUID_ALT],
  ] as const) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      char = await svc.getCharacteristic(charUuid);
      break;
    } catch { /* try next */ }
  }

  if (!char) {
    server.disconnect();
    return {
      opened: false, method: "none",
      error: "Printer does not expose a known ESC/POS BLE service",
    };
  }

  for (let i = 0; i < pulse.length; i += BLE_CHUNK_SIZE) {
    const chunk = pulse.slice(i, i + BLE_CHUNK_SIZE);
    if (char.writeValueWithoutResponse) await char.writeValueWithoutResponse(chunk);
    else await char.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 10));
  }
  server.disconnect();

  return { opened: true, method: "bluetooth", device: device.name };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Pop the cash drawer. Best-effort — resolves with a result and never throws.
 * The drawer signal travels through the printer's connection (USB or Bluetooth).
 * Pair the printer first via "Connect Printer" before calling this.
 */
export async function openCashDrawer(options?: CashDrawerOptions): Promise<CashDrawerResult> {
  const pulse = resolvePulse(options);
  try {
    // ── Native Android (Capacitor APK) ──────────────────────────────────────
    if (Capacitor.isNativePlatform()) {
      const result = await openViaNative(pulse);
      if (result.opened) return result;
      // Plugin not built in — fall through to Web Serial
      if (result.error?.includes("not registered")) {
        return await openViaWebSerial(pulse);
      }
      return result;
    }

    // ── Web: use whichever connection method the printer is using ────────────
    const type = getPrinterConnectionType();
    if (type === "bt") return await openViaBluetooth(pulse);
    return await openViaWebSerial(pulse);

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { opened: false, method: "none", error: message };
  }
}
