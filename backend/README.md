# ORIJIN Backend – Setup and Integration Guide

The backend is a Google Sheet + Google Apps Script. The Sheet is the database **and** Jin's admin panel.

## 1. Set up the backend (owner of the Sheet does this once)

1. Create a new Google Sheet named **ORIJIN Orders**.
2. **Extensions → Apps Script**. Delete the default code and paste all of `Code.gs`. Save.
3. In the function dropdown pick **`setup`** → **Run** → authorize. You now have 3 tabs:
   - **Products** – the menu (3 sample rows to replace)
   - **Orders** – new orders land here
   - **Settings** – `DELIVERY_FEE`, `NOTIFY_EMAIL` (Jin's email), `PAYMENT_INSTRUCTIONS`
4. Optional test: run **`testPlaceOrder`**, then **`testTrack`** and check the log.
   Delete the test row in Orders afterwards.
5. **Deploy → New deployment → Web app** – Execute as **Me**, Who has access **Anyone** → copy the URL ending in `/exec`.
6. Paste that URL into `ORIJIN_API` at the top of `api.js`.

> After **any** change to `Code.gs`: Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy.
> Otherwise the live URL keeps running the old code.

## 2. How Jin runs the shop from the Sheet

| He wants to… | He does this |
| --- | --- |
| Change a price, stock badge or description | Edit the row in **Products** |
| Hide an item | Untick **Show on Site** |
| Mark sold out | Set **Stock** to `Sold out` (customers can't order it) |
| Move an order along | Change the **Status** dropdown in **Orders** – the time stamps fill in automatically |
| Change the delivery fee | Edit `DELIVERY_FEE` in **Settings** |

Status flow (matches tracking.html): `For Payment` → `For Baking` → `For Delivery / Ready for Pickup` → `Delivered / Picked Up` (or `Cancelled`).

**Product photos:** put images in an `images/` folder in the GitHub repo and write the path (e.g. `images/red-velvet.jpg`) in the **Image URL** column.

## 3. Front-end integration (for the front-end dev)

Add to each page that needs data, before the page's own script:

```html
<script src="api.js"></script>
```

### menu.html / index.html – load products
```js
const { products } = await OrijinAPI.getProducts();
// each: { id, name, category, price, calories, protein, carbs, fat,
//         stock: 'In stock'|'Low stock'|'Sold out', available, description, ingredients, images[] }
// render the cards from this array instead of the hard-coded ones
// link to product page: product.html?id=P001
// "Add to cart" button: Cart.add(product.id, 1)
```

### product.html – one product
```js
const id = new URLSearchParams(location.search).get('id');
const { ok, product } = await OrijinAPI.getProduct(id);
// quantity stepper -> Cart.add(product.id, qty)
```

### Cart badge "Cart (0)" in the header
```js
document.querySelector('#cartCount').textContent = `Cart (${Cart.count()})`;
```

### checkout.html – place the order
```js
// Show the summary: getProducts() + Cart.get() to compute display prices,
// getSettings().deliveryFee for the delivery line.
// The server recalculates the real total, so displayed prices are only a preview.

const res = await OrijinAPI.placeOrder({
  name: fullNameInput.value,
  mobile: mobileInput.value,      // 09XXXXXXXXX or +639XXXXXXXXX
  email: emailInput.value,
  mode: isDelivery ? 'Delivery' : 'Pickup',
  address: addressInput.value,    // required only for Delivery
  notes: ''
}, Cart.get());

if (res.ok) {
  sessionStorage.setItem('orijin_last_order', JSON.stringify(res.order));
  Cart.clear();
  location.href = 'confirmation.html';
} else {
  showError(res.error);           // e.g. "Enter a valid mobile number..."
}
```
Change the "Pay and place order" `<a>` into a `<button>` so it can run this code.

### confirmation.html
```js
const order = JSON.parse(sessionStorage.getItem('orijin_last_order') || 'null');
// order.orderId, order.items[{name, qty, lineTotal, image}], subtotal, deliveryFee, total,
// name, address, mobile, email
```

### tracking.html (and the "Where's my order?" form on index.html)
Give the form inputs `name="orderId"` and `name="email"`; then on tracking.html:
```js
const q = new URLSearchParams(location.search);
const res = await OrijinAPI.trackOrder(q.get('orderId'), q.get('email'));
// res.order.steps = 4 items { label, done, at } – one per timeline step
// `at` is an ISO time string or null ("Not delivered yet")
```

## Not included yet
- **Accounts / login.html** – checkout works as guest. Storing passwords safely needs a real auth service (e.g. Firebase Auth); recommend keeping "Continue as guest" for the MVP.
- **Online payment** – orders start at `For Payment`; customers pay by GCash/Maya using `PAYMENT_INSTRUCTIONS`, and Jin moves the status to `For Baking` once paid.
- **Email limits** – free Gmail accounts can send about 100 emails/day (customer + Jin = 2 per order).
