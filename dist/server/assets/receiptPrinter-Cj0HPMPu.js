const COL_WIDTH = 48;
const BLE_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const BLE_CHAR_UUID = "00002af1-0000-1000-8000-00805f9b34fb";
const BLE_CHUNK_SIZE = 20;
function esc(b) {
  return String.fromCharCode(b);
}
function readStorage(key) {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}
function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
  }
}
function getPrinterConnectionType() {
  const saved = readStorage("bartap-printer-type");
  if (saved === "bt") return "bt";
  if (saved === "usb") return "usb";
  return "none";
}
async function isPrinterPaired() {
  const type = getPrinterConnectionType();
  if (type === "bt") {
    return readStorage("bartap-receipt-bt") === "1";
  }
  const serial = navigator.serial;
  if (!serial?.getPorts) return false;
  try {
    const ports = await serial.getPorts();
    return ports.length > 0;
  } catch {
    return false;
  }
}
async function pairUsbPrinter() {
  const serial = navigator.serial;
  if (!serial?.requestPort) return false;
  try {
    const port = await serial.requestPort();
    const info = port.getInfo();
    if (info.usbVendorId != null) writeStorage("bartap-receipt-vid", String(info.usbVendorId));
    if (info.usbProductId != null) writeStorage("bartap-receipt-pid", String(info.usbProductId));
    writeStorage("bartap-printer-type", "usb");
    removeStorage("bartap-receipt-bt");
    removeStorage("bartap-receipt-bt-name");
    return true;
  } catch {
    return false;
  }
}
async function pairBluetoothPrinter() {
  const bt = navigator.bluetooth;
  if (!bt?.requestDevice) return false;
  try {
    const device = await bt.requestDevice({
      // Try standard ESC/POS BLE service first; fall back to accepting all devices
      // so printers that advertise a proprietary UUID are still discoverable.
      filters: [{ services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID]
    }).catch(
      () => bt.requestDevice({ acceptAllDevices: true, optionalServices: [BLE_SERVICE_UUID] })
    );
    if (!device) return false;
    writeStorage("bartap-printer-type", "bt");
    writeStorage("bartap-receipt-bt", "1");
    if (device.name) writeStorage("bartap-receipt-bt-name", device.name);
    removeStorage("bartap-receipt-vid");
    removeStorage("bartap-receipt-pid");
    return true;
  } catch {
    return false;
  }
}
async function pairPrinter() {
  if (getPrinterConnectionType() === "bt") return pairBluetoothPrinter();
  return pairUsbPrinter();
}
function buildReceiptEscPos(data) {
  const cmds = [];
  cmds.push(esc(27) + esc(64));
  cmds.push(esc(27) + esc(97) + esc(1));
  cmds.push(center(data.storeName || "My Business", true));
  if (data.locationName) cmds.push(center(data.locationName));
  const dateStr = data.date || (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  cmds.push(center(dateStr));
  cmds.push(center(data.serverName ? `Served by ${data.serverName}` : "Served by Staff"));
  cmds.push(hr());
  cmds.push(esc(27) + esc(97) + esc(1));
  cmds.push(esc(29) + esc(33) + esc(17));
  cmds.push(esc(27) + esc(69) + esc(1));
  cmds.push(`ORDER #${data.orderNumber ?? 1}`);
  cmds.push(esc(29) + esc(33) + esc(0));
  cmds.push(esc(27) + esc(69) + esc(0));
  cmds.push(hr());
  cmds.push(esc(27) + esc(97) + esc(0));
  for (const it of data.items) {
    const qtyPrefix = `${it.qty}x `;
    const priceStr = `$${(it.qty * it.price).toFixed(2)}`;
    const maxName = COL_WIDTH - qtyPrefix.length - priceStr.length;
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
  cmds.push(esc(27) + esc(69) + esc(1));
  cmds.push(`${padRight("Total", COL_WIDTH - totalStr.length)}${totalStr}`);
  cmds.push(esc(27) + esc(69) + esc(0));
  cmds.push(hr());
  const payLabel = data.payMode === "credit" ? "Credit" : "Cash Tendered";
  const paidStr = `$${data.paid.toFixed(2)}`;
  const changeStr = `$${data.change.toFixed(2)}`;
  cmds.push(`${padRight(payLabel, COL_WIDTH - paidStr.length)}${paidStr}`);
  cmds.push(`${padRight("Change", COL_WIDTH - changeStr.length)}${changeStr}`);
  if (data.customerName) {
    cmds.push(hr());
    cmds.push(`Customer: ${data.customerName}`);
  }
  cmds.push(hr());
  cmds.push(center("Thank you for your purchase!"));
  cmds.push(esc(27) + esc(100) + esc(3));
  cmds.push(esc(29) + esc(86) + esc(66) + esc(0));
  const raw = cmds.join("\n");
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}
function center(text, bold = false) {
  const on = bold ? esc(27) + esc(69) + esc(1) : "";
  const off = bold ? esc(27) + esc(69) + esc(0) : "";
  const padded = text.padStart(Math.floor((COL_WIDTH + text.length) / 2)).slice(0, COL_WIDTH);
  return `${on}${padded}${off}`;
}
function hr() {
  return "─".repeat(COL_WIDTH);
}
function padRight(s, w) {
  return s.padEnd(w).slice(0, w);
}
async function printViaWebSerial(bytes) {
  const serial = navigator.serial;
  if (!serial?.requestPort) {
    return { opened: false, method: "none", error: "Web Serial not supported in this browser" };
  }
  const vid = parseInt(readStorage("bartap-receipt-vid") ?? "", 10);
  let port;
  try {
    const granted = await serial.getPorts();
    port = Number.isFinite(vid) && vid > 0 ? granted.find((p) => p.getInfo().usbVendorId === vid) ?? granted[0] : granted[0];
  } catch {
  }
  if (!port) {
    const filters = Number.isFinite(vid) && vid > 0 ? [{ usbVendorId: vid }] : void 0;
    port = await serial.requestPort(filters ? { filters } : void 0);
  }
  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });
  try {
    const writer = port.writable.getWriter();
    await writer.write(bytes);
    writer.releaseLock();
  } finally {
    await new Promise((r) => setTimeout(r, 200));
    await port.close().catch(() => void 0);
  }
  try {
    const info = port.getInfo();
    if (info.usbVendorId != null) writeStorage("bartap-receipt-vid", String(info.usbVendorId));
    if (info.usbProductId != null) writeStorage("bartap-receipt-pid", String(info.usbProductId));
  } catch {
  }
  writeStorage("bartap-printer-type", "usb");
  return { opened: true, method: "webserial" };
}
async function printViaBluetooth(bytes) {
  const bt = navigator.bluetooth;
  if (!bt?.requestDevice) {
    return {
      opened: false,
      method: "none",
      error: "Web Bluetooth not available — use Chrome on desktop or Android"
    };
  }
  let device;
  try {
    device = await bt.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID]
    });
  } catch {
    device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BLE_SERVICE_UUID]
    });
  }
  if (!device.gatt) {
    return { opened: false, method: "none", error: "Bluetooth device has no GATT server" };
  }
  const server = await device.gatt.connect();
  let service;
  try {
    service = await server.getPrimaryService(BLE_SERVICE_UUID);
  } catch {
    server.disconnect();
    return {
      opened: false,
      method: "none",
      error: "Printer does not expose the ESC/POS BLE service — check printer model compatibility"
    };
  }
  const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);
  for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + BLE_CHUNK_SIZE);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  server.disconnect();
  writeStorage("bartap-printer-type", "bt");
  writeStorage("bartap-receipt-bt", "1");
  if (device.name) writeStorage("bartap-receipt-bt-name", device.name);
  return { opened: true, method: "bluetooth" };
}
function printViaBrowserWindow(data) {
  try {
    const win = window.open("", "_blank", "width=420,height=650");
    if (!win) {
      return { opened: false, method: "none", error: "Popup blocked — allow popups to print receipts" };
    }
    const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const itemsHtml = data.items.map(
      (it) => `<tr>
        <td class="item-qty-name">${it.qty}x ${escHtml(it.name)}</td>
        <td class="item-price">$${(it.qty * it.price).toFixed(2)}</td>
      </tr>`
    ).join("");
    const taxHtml = data.tax != null && data.tax > 0 ? `<tr><td>Tax</td><td class="text-right">$${data.tax.toFixed(2)}</td></tr>` : "";
    const customerHtml = data.customerName ? `<tr><td>Customer</td><td class="text-right">${escHtml(data.customerName)}</td></tr>` : "";
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Receipt - ORDER #${data.orderNumber || 1}</title>
<style>
@page{size:80mm auto;margin:0}
body{font-family:'Courier New',monospace;font-size:13px;font-weight:600;color:#111;
  background:#fff;margin:0 auto;padding:20px 16px;width:300px;box-sizing:border-box;line-height:1.4}
.text-center{text-align:center}.text-right{text-align:right}
.brand-name{font-size:18px;font-weight:900;text-transform:uppercase;font-family:system-ui,sans-serif;margin-bottom:2px}
.header-info{font-size:12px;color:#333;margin-bottom:2px}
.divider{border-top:1px dashed #333;margin:10px 0}
.order-title{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin:8px 0}
.item-table,.totals-table{width:100%;border-collapse:collapse;margin:4px 0}
.item-table td,.totals-table td{padding:3px 0;vertical-align:top}
.item-qty-name{text-align:left}.item-price{text-align:right;white-space:nowrap}
.totals-table .total-row{font-size:16px;font-weight:900}
@media print{body{width:100%;padding:4px 8px}}
</style></head><body>
<div class="text-center brand-name">${escHtml(data.storeName || "My Business")}</div>
${data.locationName ? `<div class="text-center header-info">${escHtml(data.locationName)}</div>` : ""}
<div class="text-center header-info">${escHtml(data.date || "")}</div>
<div class="text-center header-info">Served by ${escHtml(data.serverName || "Staff")}</div>
<div class="divider"></div>
<div class="text-center order-title">ORDER #${data.orderNumber || 1}</div>
<div class="divider"></div>
<table class="item-table"><tbody>${itemsHtml}</tbody></table>
<div class="divider"></div>
<table class="totals-table"><tbody>
  <tr><td>Subtotal</td><td class="text-right">$${data.subtotal.toFixed(2)}</td></tr>
  ${taxHtml}
  <tr class="total-row"><td>Total</td><td class="text-right">$${data.total.toFixed(2)}</td></tr>
</tbody></table>
<div class="divider"></div>
<table class="totals-table"><tbody>
  <tr><td>${data.payMode === "credit" ? "Credit" : "Cash Tendered"}</td>
      <td class="text-right">$${data.paid.toFixed(2)}</td></tr>
  <tr><td>Change</td><td class="text-right">$${data.change.toFixed(2)}</td></tr>
  ${customerHtml}
</tbody></table>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
    return { opened: true, method: "browser" };
  } catch (e) {
    return { opened: false, method: "none", error: e instanceof Error ? e.message : "Failed to open print window" };
  }
}
async function printReceipt(data) {
  const dateStr = data.date || (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const fullData = { ...data, date: dateStr };
  const bytes = buildReceiptEscPos(fullData);
  const type = getPrinterConnectionType();
  if (type === "bt") {
    try {
      return await printViaBluetooth(bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user cancelled")) {
        return { opened: false, method: "none", needsPairing: true, error: msg };
      }
      return printViaBrowserWindow(fullData);
    }
  }
  const serial = navigator.serial;
  if (serial?.requestPort) {
    try {
      const granted = await serial.getPorts();
      if (granted.length === 0) {
        return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
      }
    } catch {
    }
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
  return printViaBrowserWindow(fullData);
}
async function printReceiptAndOpenDrawer(data, drawerPulse = new Uint8Array([27, 112, 0, 25, 25])) {
  const dateStr = data.date || (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const fullData = { ...data, date: dateStr };
  const receiptBytes = buildReceiptEscPos(fullData);
  const combined = new Uint8Array(receiptBytes.length + drawerPulse.length);
  combined.set(receiptBytes, 0);
  combined.set(drawerPulse, receiptBytes.length);
  const type = getPrinterConnectionType();
  if (type === "bt") {
    try {
      return await printViaBluetooth(combined);
    } catch (e) {
      e instanceof Error ? e.message : String(e);
      return printViaBrowserWindow(fullData);
    }
  }
  const serial = navigator.serial;
  if (serial?.requestPort) {
    try {
      const granted = await serial.getPorts();
      if (granted.length === 0) {
        return { opened: false, method: "none", needsPairing: true, error: "No printer paired yet" };
      }
    } catch {
    }
    try {
      return await printViaWebSerial(combined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { opened: false, method: "none", error: msg };
    }
  }
  return printViaBrowserWindow(fullData);
}
export {
  getPrinterConnectionType,
  isPrinterPaired,
  pairBluetoothPrinter,
  pairPrinter,
  pairUsbPrinter,
  printReceipt,
  printReceiptAndOpenDrawer
};
