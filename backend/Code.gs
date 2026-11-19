/**
 * ORIJIN – Pastry shop backend (Google Apps Script)
 * ------------------------------------------------------------
 * Google Sheet = database + Jin's admin panel
 *   Products  – the menu (Jin edits prices, stock, photos here)
 *   Orders    – every order; Jin changes the Status dropdown
 *   Settings  – delivery fee, notification email, shop name
 *
 * API (Web app URL ending in /exec):
 *   GET  ?action=products                      -> menu
 *   GET  ?action=product&id=P001               -> one product
 *   GET  ?action=track&orderId=OJ00001&email=… -> order status timeline
 *   POST {action:'placeOrder', …}              -> creates order (send as text/plain)
 *
 * FIRST-TIME SETUP
 *   1. Open the Google Sheet > Extensions > Apps Script, paste this file.
 *   2. Select `setup` in the function dropdown > Run > authorize.
 *   3. Deploy > New deployment > Web app
 *        Execute as: Me    Who has access: Anyone
 *   4. Copy the /exec URL into api.js on the website.
 *   After ANY code change: Deploy > Manage deployments > Edit > Version: New version.
 */

// ===== Configuration =====================================================

const SHEETS = { PRODUCTS: 'Products', ORDERS: 'Orders', SETTINGS: 'Settings' };

const PRODUCT_HEADERS = ['ID', 'Name', 'Category', 'Price (PHP)', 'Calories', 'Protein (g)',
  'Carbs (g)', 'Fat (g)', 'Stock', 'Description', 'Ingredients', 'Image URL',
  'Image URL 2', 'Image URL 3', 'Show on Site'];

const ORDER_HEADERS = ['Order ID', 'Placed At', 'Name', 'Mobile', 'Email', 'Mode', 'Address',
  'Items', 'Subtotal (PHP)', 'Delivery Fee (PHP)', 'Total (PHP)', 'Status',
  'Paid At', 'Ready At', 'Completed At', 'Customer Notes', 'Internal Notes', 'Items JSON'];

const CATEGORIES = ['Bread', 'Cookies', 'Cakes', 'More'];
const STOCK = ['In stock', 'Low stock', 'Sold out'];

// Order flow — matches the 4 steps on tracking.html (+ Cancelled)
const STATUS = {
  PAYMENT: 'For Payment',
  BAKING: 'For Baking',
  READY: 'For Delivery / Ready for Pickup',
  DONE: 'Delivered / Picked Up',
  CANCELLED: 'Cancelled'
};
const STATUS_LIST = [STATUS.PAYMENT, STATUS.BAKING, STATUS.READY, STATUS.DONE, STATUS.CANCELLED];

const MAX_QTY_PER_ITEM = 50;

// ===== HTTP entry points =================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'products': return json_({ ok: true, products: getProducts_() });
      case 'product':  return json_(getProduct_(p.id));
      case 'track':    return json_(trackOrder_(p.orderId, p.email));
      case 'settings': return json_({ ok: true, settings: publicSettings_() });
      default:         return json_({ ok: true, message: 'ORIJIN API is running' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'Server error: ' + err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'placeOrder') return json_(placeOrder_(body));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: 'Server error: ' + err.message });
  }
}

// ===== Products ==========================================================

function getProducts_() {
  return readRows_(SHEETS.PRODUCTS)
    .filter(r => r['ID'] && r['Name'] && isTrue_(r['Show on Site']))
    .map(toProduct_);
}

function getProduct_(id) {
  const p = getProducts_().find(x => x.id === String(id || '').trim());
  return p ? { ok: true, product: p } : { ok: false, error: 'Product not found' };
}

function toProduct_(r) {
  return {
    id: String(r['ID']).trim(),
    name: r['Name'],
    category: r['Category'],
    price: Number(r['Price (PHP)']) || 0,
    calories: Number(r['Calories']) || 0,
    protein: Number(r['Protein (g)']) || 0,
    carbs: Number(r['Carbs (g)']) || 0,
    fat: Number(r['Fat (g)']) || 0,
    stock: r['Stock'] || 'In stock',
    available: r['Stock'] !== 'Sold out',
    description: r['Description'],
    ingredients: r['Ingredients'],
    images: [r['Image URL'], r['Image URL 2'], r['Image URL 3']].filter(Boolean)
  };
}

// ===== Orders ============================================================

function placeOrder_(b) {
  // ---- Validate customer details
  const name = clean_(b.name, 80);
  const mobile = clean_(b.mobile, 20).replace(/[\s-]/g, '');
  const email = clean_(b.email, 120).toLowerCase();
  const mode = b.mode === 'Pickup' || b.mode === 'Pick-up' ? 'Pick-up'
             : b.mode === 'Delivery' ? 'Delivery' : '';
  const address = clean_(b.address, 250);
  const notes = clean_(b.notes, 300);

  const errors = [];
  if (!name) errors.push('Full name is required.');
  if (!/^(09\d{9}|\+639\d{9})$/.test(mobile)) errors.push('Enter a valid mobile number (09XX XXX XXXX).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.');
  if (!mode) errors.push('Choose Delivery or Pick-up.');
  if (mode === 'Delivery' && !address) errors.push('Delivery address is required.');
  if (!Array.isArray(b.items) || b.items.length === 0) errors.push('Your cart is empty.');
  if (errors.length) return { ok: false, error: errors.join(' '), errors: errors };

  // ---- Price the cart on the SERVER (never trust prices sent by the browser)
  const catalog = {};
  getProducts_().forEach(p => catalog[p.id] = p);

  const merged = {};
  for (const it of b.items) {
    const id = String(it && it.id || '').trim();
    const qty = Math.floor(Number(it && it.qty));
    if (!catalog[id]) return { ok: false, error: 'An item in your cart is no longer available. Please refresh the menu.' };
    if (!(qty >= 1 && qty <= MAX_QTY_PER_ITEM)) return { ok: false, error: 'Invalid quantity for ' + catalog[id].name + '.' };
    if (!catalog[id].available) return { ok: false, error: catalog[id].name + ' is sold out.' };
    merged[id] = (merged[id] || 0) + qty;
  }

  const lines = Object.keys(merged).map(id => {
    const p = catalog[id], qty = merged[id];
    if (qty > MAX_QTY_PER_ITEM) throw new Error('Too many of ' + p.name);
    return { id: id, name: p.name, qty: qty, price: p.price, lineTotal: p.price * qty, image: p.images[0] || '' };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const deliveryFee = mode === 'Delivery' ? Number(getSetting_('DELIVERY_FEE')) || 0 : 0;
  const total = subtotal + deliveryFee;

  // ---- Write the order (lock so two customers never get the same ID)
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let orderId, placedAt;
  try {
    orderId = nextOrderId_();
    placedAt = new Date();
    sheet_(SHEETS.ORDERS).appendRow([
      orderId, placedAt, safe_(name), "'" + mobile, safe_(email), mode, safe_(address),
      lines.map(l => l.qty + 'x ' + l.name).join(', '),
      subtotal, deliveryFee, total, STATUS.PAYMENT,
      '', '', '', safe_(notes), '', JSON.stringify(lines)
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const order = { orderId, placedAt: placedAt.toISOString(), name, mobile, email, mode,
    address: mode === 'Delivery' ? address : '', items: lines, subtotal, deliveryFee, total,
    status: STATUS.PAYMENT };

  // Emails are best-effort: an email failure must never lose the order
  try { emailCustomer_(order); } catch (err) { console.warn('Customer email failed: ' + err); }
  try { emailShop_(order); } catch (err) { console.warn('Shop email failed: ' + err); }

  return { ok: true, order: order };
}

function nextOrderId_() {
  const props = PropertiesService.getScriptProperties();
  let n = Number(props.getProperty('ORDER_COUNTER')) || 0;
  if (!n) {   // first run or properties reset: continue after the highest existing ID
    readRows_(SHEETS.ORDERS).forEach(r => {
      const m = /^OJ(\d+)$/.exec(r['Order ID']);
      if (m) n = Math.max(n, Number(m[1]));
    });
  }
  n += 1;
  props.setProperty('ORDER_COUNTER', String(n));
  return 'OJ' + String(n).padStart(5, '0');
}

// ===== Tracking ==========================================================

function trackOrder_(orderId, email) {
  const id = String(orderId || '').trim().toUpperCase().replace(/^#/, '');
  const em = String(email || '').trim().toLowerCase();
  if (!id || !em) return { ok: false, error: 'Enter your order number and email.' };

  const r = readRows_(SHEETS.ORDERS).find(x =>
    String(x['Order ID']).toUpperCase() === id && String(x['Email']).toLowerCase() === em);
  // Same message whether the ID or the email is wrong, so IDs can't be probed
  if (!r) return { ok: false, error: 'No order found with that order number and email.' };

  let items = [];
  try { items = JSON.parse(r['Items JSON'] || '[]'); } catch (e) {}

  const status = r['Status'] || STATUS.PAYMENT;
  const idx = STATUS_LIST.indexOf(status);
  const stamp = d => (d instanceof Date ? d.toISOString() : (d || null));

  return {
    ok: true,
    order: {
      orderId: r['Order ID'],
      mode: r['Mode'],
      status: status,
      cancelled: status === STATUS.CANCELLED,
      items: items.map(l => ({ name: l.name, qty: l.qty, price: l.price, image: l.image })),
      subtotal: Number(r['Subtotal (PHP)']) || 0,
      deliveryFee: Number(r['Delivery Fee (PHP)']) || 0,
      total: Number(r['Total (PHP)']) || 0,
      // One entry per step on tracking.html, in order
      steps: [
        { key: 'payment', label: STATUS.PAYMENT, done: idx >= 0 && idx <= 3, at: stamp(r['Placed At']) },
        { key: 'baking',  label: STATUS.BAKING,  done: idx >= 1 && idx <= 3, at: stamp(r['Paid At']) },
        { key: 'ready',   label: r['Mode'] === 'Delivery' ? 'For Delivery' : 'Ready for Pickup',
                          done: idx >= 2 && idx <= 3, at: stamp(r['Ready At']) },
        { key: 'done',    label: r['Mode'] === 'Delivery' ? 'Delivered' : 'Picked Up',
                          done: idx === 3, at: stamp(r['Completed At']) }
      ]
    }
  };
}

// ===== Jin edits the Status dropdown -> timestamps fill in automatically ====
// (Simple trigger: runs on its own whenever someone edits the sheet.)

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEETS.ORDERS || e.range.getRow() < 2) return;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf('Status') + 1;
  if (e.range.getColumn() !== statusCol || e.range.getNumColumns() !== 1) return;

  const stampCol = {
    [STATUS.BAKING]: headers.indexOf('Paid At') + 1,
    [STATUS.READY]: headers.indexOf('Ready At') + 1,
    [STATUS.DONE]: headers.indexOf('Completed At') + 1
  };
  const now = new Date();
  const rows = e.range.getNumRows();
  for (let i = 0; i < rows; i++) {
    const row = e.range.getRow() + i;
    const status = sh.getRange(row, statusCol).getValue();
    const idx = STATUS_LIST.indexOf(status);
    // Fill this step and any skipped earlier steps that are still blank
    [STATUS.BAKING, STATUS.READY, STATUS.DONE].forEach(s => {
      if (idx >= STATUS_LIST.indexOf(s) && idx <= 3) {
        const cell = sh.getRange(row, stampCol[s]);
        if (!cell.getValue()) cell.setValue(now);
      }
    });
  }
}

// ===== Emails ============================================================

function emailCustomer_(o) {
  const shop = getSetting_('SHOP_NAME') || 'ORIJIN';
  const payInfo = getSetting_('PAYMENT_INSTRUCTIONS');
  const lines = o.items.map(l => `  ${l.qty} x ${l.name}  -  PHP ${l.lineTotal}`).join('\n');
  MailApp.sendEmail({
    to: o.email,
    name: shop,
    subject: `${shop} order ${o.orderId} received`,
    body:
`Hi ${o.name},

Thank you for ordering from ${shop}! Your order number is ${o.orderId}.

${lines}

Subtotal: PHP ${o.subtotal}
Delivery fee: PHP ${o.deliveryFee}
Total: PHP ${o.total}

${o.mode}${o.mode === 'Delivery' ? ' to: ' + o.address : ''}
${payInfo ? '\nPayment: ' + payInfo + '\n' : ''}
Track your order with your order number and this email on our website.

${shop}`
  });
}

function emailShop_(o) {
  const to = getSetting_('NOTIFY_EMAIL');
  if (!to) return;
  MailApp.sendEmail(to, `New order ${o.orderId} – PHP ${o.total} (${o.mode})`,
`Order: ${o.orderId}
Name: ${o.name}
Mobile: ${o.mobile}
Email: ${o.email}
Mode: ${o.mode}${o.mode === 'Delivery' ? '\nAddress: ' + o.address : ''}

Items:
${o.items.map(l => `  ${l.qty} x ${l.name} = PHP ${l.lineTotal}`).join('\n')}

Total: PHP ${o.total}
Open the Orders sheet to update the status.`);
}

// ===== Settings ==========================================================

function getSetting_(key) {
  const row = readRows_(SHEETS.SETTINGS).find(r => r['Key'] === key);
  return row ? row['Value'] : '';
}

function publicSettings_() {
  return {
    shopName: getSetting_('SHOP_NAME') || 'ORIJIN',
    deliveryFee: Number(getSetting_('DELIVERY_FEE')) || 0,
    paymentInstructions: getSetting_('PAYMENT_INSTRUCTIONS') || ''
  };
}

// ===== One-time setup: builds the three tabs =============================

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Products
  let p = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!p) {
    p = ss.insertSheet(SHEETS.PRODUCTS);
    p.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]);
    // SAMPLE rows – Jin replaces prices, nutrition, text and photos
    p.getRange(2, 1, 3, PRODUCT_HEADERS.length).setValues([
      ['P001', 'Red Velvet Cookie', 'Cookies', 85, 0, 0, 0, 0, 'In stock',
       'Short description here', 'Ingredients here', 'images/red-velvet.jpg', '', '', true],
      ['P002', 'Basque Cheesecake', 'Cakes', 650, 0, 0, 0, 0, 'Low stock',
       'Short description here', 'Ingredients here', 'images/basque.jpg', '', '', true],
      ['P003', 'New York Style Cookie', 'Cookies', 95, 0, 0, 0, 0, 'In stock',
       'Short description here', 'Ingredients here', 'images/ny-cookie.jpg', '', '', true]
    ]);
  }
  p.setFrozenRows(1);
  p.getRange(1, 1, 1, PRODUCT_HEADERS.length).setFontWeight('bold');
  p.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build());
  p.getRange('I2:I').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STOCK, true).build());
  p.getRange('O2:O').insertCheckboxes();

  // Orders
  let o = ss.getSheetByName(SHEETS.ORDERS);
  if (!o) {
    o = ss.insertSheet(SHEETS.ORDERS);
    o.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  }
  o.setFrozenRows(1);
  o.getRange(1, 1, 1, ORDER_HEADERS.length).setFontWeight('bold');
  o.getRange('L2:L').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).build());
  o.getRange('B2:B').setNumberFormat('mmm d, yyyy h:mm am/pm');
  o.getRange('M2:O').setNumberFormat('mmm d, yyyy h:mm am/pm');
  o.hideColumns(ORDER_HEADERS.indexOf('Items JSON') + 1);

  // Settings
  let s = ss.getSheetByName(SHEETS.SETTINGS);
  if (!s) {
    s = ss.insertSheet(SHEETS.SETTINGS);
    s.getRange(1, 1, 5, 2).setValues([
      ['Key', 'Value'],
      ['SHOP_NAME', 'ORIJIN'],
      ['DELIVERY_FEE', 80],
      ['NOTIFY_EMAIL', ''],
      ['PAYMENT_INSTRUCTIONS', 'Send payment via GCash to 09XX XXX XXXX and reply with your screenshot.']
    ]);
    s.getRange('A1:B1').setFontWeight('bold');
    s.setColumnWidth(2, 420);
  }

  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

// ===== Helpers ===========================================================

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '". Run setup() first.');
  return sh;
}

function readRows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const h = values[0];
  return values.slice(1).map(row => {
    const o = {};
    h.forEach((k, i) => o[k] = row[i]);
    return o;
  });
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Stops "=HYPERLINK(...)"-style formula injection from customer input
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function isTrue_(v) {
  return v === true || String(v).toLowerCase() === 'true' || v === 'Yes';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Tests you can run from the editor =================================

function testPlaceOrder() {
  const res = placeOrder_({
    name: 'Test Customer', mobile: '09171234567', email: 'test@example.com',
    mode: 'Delivery', address: '123 Sample St, Brgy. Uno, Manila',
    items: [{ id: 'P001', qty: 2 }, { id: 'P003', qty: 1 }], notes: 'test order'
  });
  console.log(JSON.stringify(res, null, 2));
}

function testTrack() {
  console.log(JSON.stringify(trackOrder_('OJ00001', 'test@example.com'), null, 2));
}
