// ORIJIN – front-end helper for the Apps Script backend.
// Add to every page that needs data:  <script src="api.js"></script>

const ORIJIN_API = 'PASTE_YOUR_EXEC_URL_HERE'; // ends in /exec

async function apiGet(params) {
  const res = await fetch(ORIJIN_API + '?' + new URLSearchParams(params));
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(ORIJIN_API, {
    method: 'POST',
    // text/plain is required: application/json triggers a CORS error on Apps Script
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

const OrijinAPI = {
  /** -> { ok, products: [{ id, name, category, price, calories, protein, carbs, fat,
   *                         stock, available, description, ingredients, images[] }] } */
  getProducts: () => apiGet({ action: 'products' }),

  /** -> { ok, product } */
  getProduct: (id) => apiGet({ action: 'product', id }),

  /** -> { ok, settings: { shopName, deliveryFee, paymentInstructions } } */
  getSettings: () => apiGet({ action: 'settings' }),

  /** details = { name, mobile, email, mode: 'Delivery'|'Pickup', address, notes }
   *  items   = [{ id: 'P001', qty: 2 }, ...]   (prices are calculated by the server)
   *  -> { ok, order: { orderId, items, subtotal, deliveryFee, total, status, ... } }
   *  or { ok: false, error, errors[] } */
  placeOrder: (details, items) => apiPost({ action: 'placeOrder', ...details, items }),

  /** -> { ok, order: { orderId, mode, status, cancelled, items, total,
   *                    steps: [{ key, label, done, at }] x4 } } */
  trackOrder: (orderId, email) => apiGet({ action: 'track', orderId, email })
};

// ---- Cart (kept in the browser between pages) ----------------------------
const Cart = {
  get() {
    try { return JSON.parse(localStorage.getItem('orijin_cart')) || []; } catch (e) { return []; }
  },
  save(items) {
    try { localStorage.setItem('orijin_cart', JSON.stringify(items)); } catch (e) {}
  },
  add(id, qty = 1) {
    const items = Cart.get();
    const found = items.find(i => i.id === id);
    if (found) found.qty += qty; else items.push({ id, qty });
    Cart.save(items);
  },
  setQty(id, qty) {
    Cart.save(Cart.get().map(i => i.id === id ? { ...i, qty } : i).filter(i => i.qty > 0));
  },
  remove(id) { Cart.save(Cart.get().filter(i => i.id !== id)); },
  clear() { Cart.save([]); },
  count() { return Cart.get().reduce((s, i) => s + i.qty, 0); }
};

const peso = (n) => '₱ ' + Number(n || 0).toLocaleString('en-PH');
