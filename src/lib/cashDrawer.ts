/**
 * cashDrawer.ts — POS cash drawer integration for BarTap Pro.
 *
 * `openCashDrawer()` pops the physical cash drawer:
 *  - Installed app (Capacitor/Android on a POS terminal): delegates to the
 *    `CashDrawer` native plugin, which sends an ESC/POS pulse over Android USB
 *    Host to a connected USB receipt printer / cash drawer.
 *  - Browser (and Capacitor webviews without the native plugin): uses the Web
 *    Serial API to send the same ESC/POS pulse to a USB-serial adapter or
 *    ESC/POS printer.
 *  - No-op when no hardware / API is available — never throws, so it is safe to
 *    fire-and-forget from a click handler.
 *
 * Call this from a user gesture (a button click), e.g. when the cashier
 * confirms a sale. The Web Serial path reuses an already-granted port so the
 * user is only prompted to pick a device once.
 *
 * Hardware overrides (all optional — set via localStorage):
 *   bartap-drawer-pulse  -> hex ESC/POS bytes, e.g. "1b70001919" (default)
 *   bartap-drawer-vid    -> decimal USB vendor id filter
 *   bartap-drawer-pid    -> decimal USB product id filter
 */

import { Capacitor } from "@capacitor/core";

export type CashDrawerMethod = "native" | "webserial" | "none";

export interface CashDrawerResult {
  opened: boolean;
  method: CashDrawerMethod;
  device?: string;
  error?: string;
}

export interface CashDrawerOptions {
  pulseHex?: string;
  vid?: number;
  pid?: number;
}

interface CashDrawerConfig {
  pulse: number[];
  vid?: number;
  pid?: number;
}

type NativeCashDrawerApi = {
  open: (opts: { pulseHex: string; vid: number | null; pid: number | null }) => Promise<CashDrawerResult>;
};

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

/** ESC/POS "open cash drawer #1": ESC p m t s = 1B 70 00 19 19 */
const DEFAULT_PULSE: number[] = [0x1b, 0x70, 0x00, 0x19, 0x19];
const DEFAULT_PULSE_HEX = "1b70001919";

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function parsePulseHex(hex: string | null | undefined): number[] {
  const cleaned = (hex ?? "").replace(/\s+/g, "");
  const pairs = cleaned.match(/[0-9a-fA-F]{2}/g);
  if (!pairs || pairs.length === 0) return DEFAULT_PULSE;
  return pairs.map((h) => parseInt(h, 16));
}

function resolveConfig(opts?: CashDrawerOptions): CashDrawerConfig {
  const pulse = parsePulseHex(opts?.pulseHex ?? readStorage("bartap-drawer-pulse") ?? DEFAULT_PULSE_HEX);

  const vid = opts?.vid ?? parseInt(readStorage("bartap-drawer-vid") ?? "", 10);
  const pid = opts?.pid ?? parseInt(readStorage("bartap-drawer-pid") ?? "", 10);

  return {
    pulse,
    vid: Number.isFinite(vid) && vid > 0 ? vid : undefined,
    pid: Number.isFinite(pid) && pid > 0 ? pid : undefined,
  };
}

function openViaNative(cfg: CashDrawerConfig): Promise<CashDrawerResult> {
  const plugins = (
    Capacitor as unknown as { Plugins?: Record<string, Record<string, CallableFunction>> }
  ).Plugins;
  const raw = plugins?.CashDrawer;
  const api = raw ? (raw as unknown as NativeCashDrawerApi) : null;
  if (!api?.open) {
    return Promise.resolve({
      opened: false,
      method: "none" as CashDrawerMethod,
      error: "CashDrawer native plugin not registered — rebuild the Android app or connect a USB/WebSerial printer",
    });
  }
  return api.open({
    pulseHex: cfg.pulse.map((b) => b.toString(16).padStart(2, "0")).join(""),
    vid: cfg.vid ?? null,
    pid: cfg.pid ?? null,
  });
}

async function openViaWebSerial(cfg: CashDrawerConfig): Promise<CashDrawerResult> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.requestPort) {
    return {
      opened: false,
      method: "none",
      error: "Web Serial API not available — open in Chrome/Edge, or install the app",
    };
  }

  let port: WebSerialPort | undefined;
  // Reuse a previously-granted port so the device picker only appears once.
  try {
    const granted = await serial.getPorts();
    if (cfg.vid != null) {
      port = granted.find((p) => p.getInfo().usbVendorId === cfg.vid);
    }
    if (!port) port = granted[0];
  } catch {
    /* ignore — fall through to requestPort */
  }

  if (!port) {
    const filters = cfg.vid != null ? [{ usbVendorId: cfg.vid }] : undefined;
    port = await serial.requestPort(filters ? { filters } : undefined);
  }

  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });

  let device: string | undefined;
  try {
    const info = port.getInfo();
    if (info.usbVendorId != null && info.usbProductId != null) {
      device = `VID ${info.usbVendorId} PID ${info.usbProductId}`;
      // Persist device info so we can filter the picker next time
      if (info.usbVendorId != null) {
        try { localStorage.setItem("bartap-drawer-vid", String(info.usbVendorId)); } catch {}
      }
    }
  } catch {
    /* best-effort label */
  }

  const writer = await port.writable.getWriter();
  try {
    await writer.write(new Uint8Array(cfg.pulse));
  } finally {
    writer.releaseLock();
  }

  // Hold the link briefly so slower drawers still receive the full kick pulse,
  // then release the port back to the OS.
  await new Promise((r) => setTimeout(r, 150));
  await port.close().catch(() => undefined);

  return { opened: true, method: "webserial", device };
}

/**
 * Pop the cash drawer. Best-effort: resolves with a result describing what
 * happened and never throws. Safe to call as `void openCashDrawer()` from an
 * onClick handler.
 */
export async function openCashDrawer(options?: CashDrawerOptions): Promise<CashDrawerResult> {
  const cfg = resolveConfig(options);
  try {
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await openViaNative(cfg);
      if (nativeResult.opened) return nativeResult;
      if (nativeResult.error?.includes("not registered")) {
        return await openViaWebSerial(cfg);
      }
      return nativeResult;
    }
    return await openViaWebSerial(cfg);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { opened: false, method: "none", error: message };
  }
}
