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

// Column order is what Jin sees. The code finds columns by NAME, so columns can be moved.
const PRODUCT_HEADERS = ['ID', 'Name', 'Category', 'Price (PHP)', 'Stock', 'Short Description',
  'Ingredients', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)',
  'Photo 1', 'Photo 2', 'Photo 3', 'Featured on Home', 'Hidden'];

const PRODUCT_NOTES = {
  'ID': 'Filled in automatically when you type a Name. Do not change it after customers have ordered.',
  'Name': 'Product name as customers see it.',
  'Category': 'Pick from the list or type a new one (e.g. Bread, Cookies, Cakes, More). New categories appear as filter buttons on the menu.',
  'Price (PHP)': 'Price in pesos, numbers only (e.g. 85). Items with no price cannot be ordered.',
  'Stock': 'In stock / Low stock / Sold out. Sold out items stay visible but cannot be ordered.',
  'Short Description': 'One or two sentences shown on the product page.',
  'Ingredients': 'Comma-separated list, e.g. flour, butter, cream cheese, eggs.',
  'Calories': 'Per piece. Leave 0 if unknown.',
  'Photo 1': 'Main photo. Paste a Google Drive link (then use ORIJIN menu > Make product photos viewable) or a link like images/red-velvet.png.',
  'Photo 2': 'Optional extra photo.',
  'Photo 3': 'Optional extra photo.',
  'Featured on Home': 'Tick to show in "Fresh from the oven" on the home page (up to 3).',
  'Hidden': 'Tick to hide the product from the website without deleting it.'
};

const PRODUCTS_CACHE_KEY = 'products_v2';
const PRODUCTS_CACHE_SECONDS = 300; // cleared instantly whenever Products is edited

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

// The website reads a cached copy (fast). Editing the Products tab clears the cache,
// so Jin's changes show on the next page load.
function getProducts_(opts) {
  const cache = CacheService.getScriptCache();
  if (!(opts && opts.fresh)) {
    const hit = cache.get(PRODUCTS_CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }
  const list = readRows_(SHEETS.PRODUCTS)
    .filter(r => String(r['ID']).trim() && String(r['Name']).trim() && !isTrue_(r['Hidden']))
    .map(toProduct_);
  try { cache.put(PRODUCTS_CACHE_KEY, JSON.stringify(list), PRODUCTS_CACHE_SECONDS); } catch (e) {}
  return list;
}

function getProduct_(id) {
  const p = getProducts_().find(x => x.id === String(id || '').trim());
  return p ? { ok: true, product: p } : { ok: false, error: 'Product not found' };
}

function toProduct_(r) {
  const price = Number(r['Price (PHP)']) || 0;
  const stock = STOCK.indexOf(r['Stock']) >= 0 ? r['Stock'] : 'In stock';
  return {
    id: String(r['ID']).trim(),
    name: String(r['Name']).trim(),
    category: String(r['Category'] || 'More').trim(),
    price: price,
    stock: stock,
    available: stock !== 'Sold out' && price > 0,
    description: String(r['Short Description'] || '').trim(),
    ingredients: String(r['Ingredients'] || '').trim(),
    calories: Number(r['Calories']) || 0,
    protein: Number(r['Protein (g)']) || 0,
    carbs: Number(r['Carbs (g)']) || 0,
    fat: Number(r['Fat (g)']) || 0,
    featured: isTrue_(r['Featured on Home']),
    images: [r['Photo 1'], r['Photo 2'], r['Photo 3']].map(photoUrl_).filter(Boolean)
  };
}

// Turns a Google Drive share link into a direct image link the website can show.
// Other links (images/x.png, https://...) are used as they are.
function photoUrl_(v) {
  v = String(v || '').trim();
  if (!v) return '';
  const id = driveFileId_(v);
  return id ? 'https://lh3.googleusercontent.com/d/' + id + '=w1000' : v;
}

function driveFileId_(v) {
  if (!/(drive|docs)\.google\.com/.test(v)) return '';
  const m = v.match(/\/d\/([\w-]{20,})/) || v.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : '';
}

function clearProductCache_() {
  CacheService.getScriptCache().remove(PRODUCTS_CACHE_KEY);
}

function nextProductId_(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = h.indexOf('ID');
  let n = 0;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const m = /^P(\d+)$/.exec(String(r[col]).trim());
    if (m) n = Math.max(n, Number(m[1]));
  });
  return 'P' + String(n + 1).padStart(3, '0');
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
  getProducts_({ fresh: true }).forEach(p => catalog[p.id] = p);

  const merged = {};
  for (const it of b.items) {
    const id = String(it && it.id || '').trim();
    const qty = Math.floor(Number(it && it.qty));
    if (!catalog[id]) return { ok: false, error: 'An item in your cart is no longer available. Please refresh the menu.' };
    if (!(qty >= 1 && qty <= MAX_QTY_PER_ITEM)) return { ok: false, error: 'Invalid quantity for ' + catalog[id].name + '.' };
    if (!catalog[id].available) return { ok: false, error: catalog[id].name + ' is not available right now.' };
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

// ===== Runs automatically whenever someone edits the Sheet ==================
// (Simple trigger – no setup needed.)

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (e.range.getRow() < 2) return;
  if (sh.getName() === SHEETS.PRODUCTS) return onProductsEdit_(e, sh);
  if (sh.getName() === SHEETS.ORDERS) return onOrdersEdit_(e, sh);
}

// Products: give new rows an ID + default stock, and refresh the website's copy
function onProductsEdit_(e, sh) {
  clearProductCache_();
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idCol = h.indexOf('ID') + 1, nameCol = h.indexOf('Name') + 1, stockCol = h.indexOf('Stock') + 1;
  if (!idCol || !nameCol) return;
  for (let i = 0; i < e.range.getNumRows(); i++) {
    const row = e.range.getRow() + i;
    if (!String(sh.getRange(row, nameCol).getValue()).trim()) continue;
    const idCell = sh.getRange(row, idCol);
    if (!String(idCell.getValue()).trim()) {
      idCell.setValue(nextProductId_(sh));
      if (stockCol && !sh.getRange(row, stockCol).getValue()) sh.getRange(row, stockCol).setValue('In stock');
    }
  }
}

// Orders: when Jin changes Status, stamp the time for that step
function onOrdersEdit_(e, sh) {
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
    p = ss.insertSheet(SHEETS.PRODUCTS, 0);
    p.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]);
    // SAMPLE rows – Jin replaces prices, descriptions, ingredients and photos
    const sample = (id, name, cat, price, stock, photo, featured) => {
      const r = {};
      r['ID'] = id; r['Name'] = name; r['Category'] = cat; r['Price (PHP)'] = price; r['Stock'] = stock;
      r['Short Description'] = 'Replace with a short description.';
      r['Ingredients'] = 'Replace with ingredients, separated by commas';
      r['Photo 1'] = photo; r['Featured on Home'] = featured; r['Hidden'] = false;
      return PRODUCT_HEADERS.map(k => r[k] !== undefined ? r[k] : (/\(g\)|Calories/.test(k) ? 0 : ''));
    };
    p.getRange(2, 1, 3, PRODUCT_HEADERS.length).setValues([
      sample('P001', 'Red Velvet Cookie', 'Cookies', 85, 'In stock', 'images/red-velvet-cookie.png', true),
      sample('P002', 'Basque Cheesecake', 'Cakes', 650, 'Low stock', 'images/basque-cheesecake.png', true),
      sample('P003', 'New York Style Cookie', 'Cookies', 95, 'In stock', 'images/new-york-cookie.png', true)
    ]);
  }
  ensureHeaders_(p, PRODUCT_HEADERS);
  styleProducts_(p);

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
  clearProductCache_();
}

// Adds any missing columns at the end (safe to run setup() again later)
function ensureHeaders_(sh, headers) {
  const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  headers.filter(h => have.indexOf(h) < 0).forEach(h => {
    sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
  });
}

function productCol_(sh, header) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const c = h.indexOf(header) + 1;
  return c ? sh.getRange(2, c, sh.getMaxRows() - 1, 1) : null;
}

function styleProducts_(p) {
  const last = p.getLastColumn();
  p.setFrozenRows(1);
  p.setFrozenColumns(2);
  p.getRange(1, 1, 1, last).setFontWeight('bold').setBackground('#084BAC').setFontColor('#FFFFFF').setWrap(true);
  const h = p.getRange(1, 1, 1, last).getValues()[0];
  h.forEach((name, i) => { if (PRODUCT_NOTES[name]) p.getRange(1, i + 1).setNote(PRODUCT_NOTES[name]); });

  const dv = SpreadsheetApp.newDataValidation;
  productCol_(p, 'Category').setDataValidation(dv().requireValueInList(CATEGORIES, true).setAllowInvalid(true).build());
  productCol_(p, 'Stock').setDataValidation(dv().requireValueInList(STOCK, true).setAllowInvalid(false).build());
  productCol_(p, 'Price (PHP)').setDataValidation(dv().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
    .setHelpText('Numbers only, e.g. 85').build()).setNumberFormat('"₱"#,##0.00');
  ['Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'].forEach(k =>
    productCol_(p, k).setDataValidation(dv().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build()));
  ['Featured on Home', 'Hidden'].forEach(k => productCol_(p, k).insertCheckboxes());
  ['Short Description', 'Ingredients'].forEach(k => productCol_(p, k).setWrap(true));

  const widths = { 'ID': 60, 'Name': 180, 'Category': 100, 'Price (PHP)': 90, 'Stock': 95,
    'Short Description': 280, 'Ingredients': 240, 'Photo 1': 200, 'Photo 2': 160, 'Photo 3': 160 };
  h.forEach((name, i) => { if (widths[name]) p.setColumnWidth(i + 1, widths[name]); });
  productCol_(p, 'ID').setFontColor('#777777');
}

// ===== ORIJIN menu in the Google Sheet (appears when the Sheet opens) =====

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ORIJIN')
    .addItem('Add a new product', 'menuAddProduct')
    .addItem('Make product photos viewable on the website', 'menuSharePhotos')
    .addItem('Update the website now', 'menuRefreshSite')
    .addSeparator()
    .addItem('How to edit the menu', 'menuHelp')
    .addToUi();
}

function menuAddProduct() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = sheet_(SHEETS.PRODUCTS);
  const row = sh.getLastRow() + 1;
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(row, h.indexOf('ID') + 1).setValue(nextProductId_(sh));
  sh.getRange(row, h.indexOf('Stock') + 1).setValue('In stock');
  ss.setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(row, h.indexOf('Name') + 1));
  clearProductCache_();
  ss.toast('Type the product name, price and details in this row.', 'New product added', 6);
}

function menuSharePhotos() {
  const sh = sheet_(SHEETS.PRODUCTS);
  const ui = SpreadsheetApp.getUi();
  let done = 0;
  const failed = [];
  readRows_(SHEETS.PRODUCTS).forEach(r => {
    ['Photo 1', 'Photo 2', 'Photo 3'].forEach(k => {
      const id = driveFileId_(String(r[k] || ''));
      if (!id) return;
      try {
        DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        done++;
      } catch (err) {
        failed.push(r['Name'] + ' (' + k + ')');
      }
    });
  });
  clearProductCache_();
  ui.alert(done + ' photo(s) can now be seen on the website.' +
    (failed.length ? '\n\nCould not update: ' + failed.join(', ') +
      '\nOpen those photos in Google Drive > Share > "Anyone with the link".' : ''));
}

function menuRefreshSite() {
  clearProductCache_();
  SpreadsheetApp.getActiveSpreadsheet().toast('The website will show your latest changes on the next page load.', 'Website updated', 5);
}

function menuHelp() {
  SpreadsheetApp.getUi().alert('How to edit the ORIJIN menu',
    'CHANGE A PRICE, DESCRIPTION OR INGREDIENTS\n' +
    'Edit the cell in the Products tab. The website updates on the next page load.\n\n' +
    'ADD A PRODUCT\n' +
    'ORIJIN menu > Add a new product (or type a name in the next empty row).\n\n' +
    'ADD A PHOTO\n' +
    '1. Upload the photo to Google Drive.\n' +
    '2. Right-click it > Share > Copy link, and paste the link in Photo 1.\n' +
    '3. ORIJIN menu > Make product photos viewable on the website.\n\n' +
    'SOLD OUT\nSet Stock to "Sold out". It stays on the menu but cannot be ordered.\n\n' +
    'HIDE A PRODUCT\nTick Hidden. Untick to bring it back.\n\n' +
    'HOME PAGE\nTick "Featured on Home" for up to 3 products.\n\n' +
    'Hover over a column title to see what goes in it.',
    SpreadsheetApp.getUi().ButtonSet.OK);
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
