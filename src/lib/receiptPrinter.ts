/**
 * receiptPrinter.ts — prints a sale receipt to an ESC/POS thermal printer.
 *
 * Sends raw ESC/POS commands over the Web Serial API or, when running inside
 * the Capacitor Android app, falls back to opening a browser print window.
 *
 * Hardware overrides (optional — set via localStorage):
 *   bartap-receipt-vid -> decimal USB vendor id filter
 *   bartap-receipt-pid -> decimal USB product id filter
 */

const COL_WIDTH = 48;

function esc(b: number): string {
  return String.fromCharCode(b);
}

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

function buildReceiptEscPos(data: ReceiptData): string {
  const cmds: string[] = [];

  // Reset printer
  cmds.push(esc(0x1b) + esc(0x40));
  // Align center
  cmds.push(esc(0x1b) + esc(0x61) + esc(0x01));

  // User Business Name Header (Bold & Uppercase)
  cmds.push(center(data.storeName || "My Business", true));

  // Location
  if (data.locationName) {
    cmds.push(center(data.locationName));
  }

  // Date timestamp (e.g. 8/15/2026, 6:39:42 AM)
  const dateStr =
    data.date ||
    new Date().toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  cmds.push(center(dateStr));

  // Server line
  const server = data.serverName ? `Served by ${data.serverName}` : "Served by Staff";
  cmds.push(center(server));

  // Horizontal divider
  cmds.push(hr());

  // ORDER #X (Centered, Double Size, Bold)
  const orderNum = data.orderNumber ?? 1;
  cmds.push(esc(0x1b) + esc(0x61) + esc(0x01)); // Center align
  cmds.push(esc(0x1d) + esc(0x21) + esc(0x11)); // Double width & height
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x01)); // Bold ON
  cmds.push(`ORDER #${orderNum}`);
  cmds.push(esc(0x1d) + esc(0x21) + esc(0x00)); // Reset size
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x00)); // Bold OFF

  // Horizontal divider
  cmds.push(hr());

  // Items List (Left align)
  cmds.push(esc(0x1b) + esc(0x61) + esc(0x00));

  for (const it of data.items) {
    const qtyPrefix = `${it.qty}x `;
    const priceStr = `$${(it.qty * it.price).toFixed(2)}`;
    const maxNameLen = COL_WIDTH - qtyPrefix.length - priceStr.length;
    const nameStr = padRight(it.name, Math.max(1, maxNameLen));
    cmds.push(`${qtyPrefix}${nameStr}${priceStr}`);
  }

  // Divider
  cmds.push(hr());

  // Totals
  const subtotalStr = `$${data.subtotal.toFixed(2)}`;
  cmds.push(`${padRight("Subtotal", COL_WIDTH - subtotalStr.length)}${subtotalStr}`);

  if (data.tax != null && data.tax > 0) {
    const taxStr = `$${data.tax.toFixed(2)}`;
    cmds.push(`${padRight("Tax", COL_WIDTH - taxStr.length)}${taxStr}`);
  }

  const totalStr = `$${data.total.toFixed(2)}`;
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x01)); // Bold ON
  cmds.push(`${padRight("Total", COL_WIDTH - totalStr.length)}${totalStr}`);
  cmds.push(esc(0x1b) + esc(0x45) + esc(0x00)); // Bold OFF

  cmds.push(hr());

  // Payment & Change
  const payLabel = data.payMode === "credit" ? "Credit" : "Cash Tendered";
  const paidStr = `$${data.paid.toFixed(2)}`;
  cmds.push(`${padRight(payLabel, COL_WIDTH - paidStr.length)}${paidStr}`);

  const changeStr = `$${data.change.toFixed(2)}`;
  cmds.push(`${padRight("Change", COL_WIDTH - changeStr.length)}${changeStr}`);

  if (data.customerName) {
    cmds.push(hr());
    cmds.push(`Customer: ${data.customerName}`);
  }

  cmds.push(hr());
  cmds.push(center("Thank you for your purchase!", false));
  cmds.push(esc(0x1b) + esc(0x64) + esc(0x03));
  cmds.push(esc(0x1d) + esc(0x56) + esc(0x42) + esc(0x00));

  return cmds.join("\n");
}

function center(text: string, bold = false): string {
  const tag = bold ? esc(0x1b) + esc(0x45) + esc(0x01) : "";
  const reset = bold ? esc(0x1b) + esc(0x45) + esc(0x00) : "";
  const padded = text.padStart(Math.floor((COL_WIDTH + text.length) / 2)).slice(0, COL_WIDTH);
  return `${tag}${padded}${reset}`;
}

function hr(): string {
  return "\u2500".repeat(COL_WIDTH);
}

function padLeft(s: string, w: number): string {
  return s.padStart(w).slice(-w);
}

function padRight(s: string, w: number): string {
  return s.padEnd(w).slice(0, w);
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export async function printReceipt(
  data: ReceiptData,
): Promise<{ opened: boolean; method: string; needsPairing?: boolean; error?: string }> {
  const dateStr =
    data.date ||
    new Date().toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const fullData: ReceiptData = {
    ...data,
    date: dateStr,
  };

  const payload = buildReceiptEscPos(fullData);
  const vid = parseInt(readStorage("bartap-receipt-vid") ?? "", 10);
  const pid = parseInt(readStorage("bartap-receipt-pid") ?? "", 10);

  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (serial?.requestPort) {
    // Check if any port is already granted — if not, signal caller to show pairing UI
    try {
      const granted = await serial.getPorts();
      const hasPort = granted.length > 0;
      if (!hasPort) {
        return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
      }
    } catch {
      // If getPorts fails, proceed and let requestPort handle it
    }
    try {
      return await printViaWebSerial(payload, vid, pid);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // User cancelled the picker — not an error
      if (message.includes("cancelled") || message.includes("No port")) {
        return { opened: false, method: "none", needsPairing: true, error: message };
      }
      return { opened: false, method: "none", error: message };
    }
  }

  return printViaBrowserWindow(fullData, payload);
}

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

async function printViaWebSerial(
  payload: string,
  vid?: number,
  pid?: number,
): Promise<{ opened: boolean; method: string; error?: string }> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.requestPort) {
    return printViaBrowserWindow(
      { storeName: "My Business", items: [], subtotal: 0, total: 0, paid: 0, change: 0, payMode: "cash" },
      payload,
    );
  }

  let port: WebSerialPort | undefined;
  try {
    const granted = await serial.getPorts();
    if (vid != null) {
      port = granted.find((p) => p.getInfo().usbVendorId === vid);
    }
    if (!port) port = granted[0];
  } catch {
    // ignore — fall through to requestPort
  }

  if (!port) {
    const filters = vid != null ? [{ usbVendorId: vid }] : undefined;
    port = await serial.requestPort(filters ? { filters } : undefined);
  }

  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });

  try {
    const writer = await port.writable.getWriter();
    await writer.write(new Uint8Array([...payload].map((c) => c.charCodeAt(0))));
    writer.releaseLock();
  } finally {
    await new Promise((r) => setTimeout(r, 200));
    await port.close().catch(() => undefined);
  }

  // Persist device info so we can filter the picker next time
  try {
    const info = port.getInfo();
    if (info.usbVendorId != null) {
      localStorage.setItem("bartap-receipt-vid", String(info.usbVendorId));
    }
  } catch {
    /* ignore */
  }

  return { opened: true, method: "webserial" };
}

function printViaBrowserWindow(
  data: ReceiptData,
  rawPayload: string,
): {
  opened: boolean;
  method: string;
  error?: string;
} {
  try {
    const win = window.open("", "_blank", "width=420,height=650");
    if (!win) {
      return {
        opened: false,
        method: "none",
        error: "Popup blocked — allow popups to print receipts",
      };
    }

    const itemsHtml = data.items
      .map(
        (it) => `
      <tr>
        <td class="item-qty-name">${it.qty}x  ${escapeHtml(it.name)}</td>
        <td class="item-price">$${(it.qty * it.price).toFixed(2)}</td>
      </tr>`,
      )
      .join("");

    const taxHtml =
      data.tax != null && data.tax > 0
        ? `
      <tr>
        <td class="text-left">Tax</td>
        <td class="text-right">$${data.tax.toFixed(2)}</td>
      </tr>`
        : "";

    const customerHtml = data.customerName
      ? `
      <tr>
        <td class="text-left">Customer</td>
        <td class="text-right">${escapeHtml(data.customerName)}</td>
      </tr>`
        : "";

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - ORDER #${data.orderNumber || 1}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      font-weight: 600;
      color: #111;
      background: #fff;
      margin: 0 auto;
      padding: 20px 16px;
      width: 300px;
      box-sizing: border-box;
      line-height: 1.4;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }

    .brand-name {
      font-size: 18px;
      font-weight: 900;
      color: #111;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
      text-transform: uppercase;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .header-info {
      font-size: 12px;
      color: #333;
      margin-bottom: 2px;
    }

    .divider {
      border-top: 1px dashed #333;
      margin: 10px 0;
    }

    .order-title {
      font-size: 22px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 8px 0;
    }

    .item-table, .totals-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    .item-table td, .totals-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .item-qty-name {
      text-align: left;
    }
    .item-price {
      text-align: right;
      white-space: nowrap;
    }

    .totals-table .total-row {
      font-size: 16px;
      font-weight: 900;
    }

    @media print {
      body {
        width: 100%;
        padding: 4px 8px;
      }
    }
  </style>
</head>
<body>
  <div class="text-center brand-name">${escapeHtml(data.storeName || "My Business")}</div>
  ${data.locationName ? `<div class="text-center header-info">${escapeHtml(data.locationName)}</div>` : ""}
  <div class="text-center header-info">${escapeHtml(data.date || "")}</div>
  <div class="text-center header-info">Served by ${escapeHtml(data.serverName || "Staff")}</div>

  <div class="divider"></div>

  <div class="text-center order-title">ORDER #${data.orderNumber || 1}</div>

  <div class="divider"></div>

  <table class="item-table">
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="divider"></div>

  <table class="totals-table">
    <tbody>
      <tr>
        <td class="text-left">Subtotal</td>
        <td class="text-right">$${data.subtotal.toFixed(2)}</td>
      </tr>
      ${taxHtml}
      <tr class="total-row">
        <td class="text-left">Total</td>
        <td class="text-right">$${data.total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="divider"></div>

  <table class="totals-table">
    <tbody>
      <tr>
        <td class="text-left">${data.payMode === "credit" ? "Credit" : "Cash Tendered"}</td>
        <td class="text-right">$${data.paid.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="text-left">Change</td>
        <td class="text-right">$${data.change.toFixed(2)}</td>
      </tr>
      ${customerHtml}
    </tbody>
  </table>

</body>
</html>`;

    win.document.write(htmlContent);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
    return { opened: true, method: "browser" };
  } catch (e) {
    return {
      opened: false,
      method: "none",
      error: e instanceof Error ? e.message : "Failed to open print window",
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Pair the printer by prompting the user to select a USB serial device.
 * Stores the VID so subsequent printReceipt() calls skip the picker.
 * Returns true if a port was successfully selected.
 */
export async function pairPrinter(): Promise<boolean> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.requestPort) return false;
  try {
    const port = await serial.requestPort();
    const info = port.getInfo();
    if (info.usbVendorId != null) {
      localStorage.setItem("bartap-receipt-vid", String(info.usbVendorId));
    }
    if (info.usbProductId != null) {
      localStorage.setItem("bartap-receipt-pid", String(info.usbProductId));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if a printer port is already granted in this browser session.
 */
export async function isPrinterPaired(): Promise<boolean> {
  const serial = (navigator as unknown as { serial?: WebSerialAPI }).serial;
  if (!serial?.getPorts) return false;
  try {
    const ports = await serial.getPorts();
    return ports.length > 0;
  } catch {
    return false;
  }
}
