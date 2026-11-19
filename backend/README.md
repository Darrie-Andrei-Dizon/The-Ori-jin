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

## 2. How Jin updates the menu (no coding needed)

Everything lives in the **Products** tab. Changes show on the website on the next page load.
There is also an **ORIJIN** menu at the top of the Sheet (Add a new product, Make product photos viewable, Update the website now, How to edit the menu). Hover over any column title for a hint.

| Jin wants to… | He does this in **Products** |
| --- | --- |
| Change a price | Edit **Price (PHP)** (numbers only) |
| Change the description | Edit **Short Description** |
| Change ingredients | Edit **Ingredients** (comma-separated) |
| Update nutrition | Edit **Calories**, **Protein (g)**, **Carbs (g)**, **Fat (g)** |
| Add a product | ORIJIN menu → **Add a new product**, or type a name in the next empty row (the ID fills in by itself) |
| Add or change a photo | Upload to Google Drive → Share → Copy link → paste in **Photo 1** (2 and 3 optional) → ORIJIN menu → **Make product photos viewable on the website** |
| Mark sold out | Set **Stock** to `Sold out` (stays visible, can't be ordered) |
| Hide a product | Tick **Hidden** |
| Choose the home page items | Tick **Featured on Home** (up to 3) |
| New category | Type it in **Category**; it appears as a filter button on the menu |

Don't change a product's **ID** after it has been ordered. Columns can be moved or resized freely.

Orders: change the **Status** dropdown in **Orders**; the time stamps fill in automatically.
Flow: `For Payment` → `For Baking` → `For Delivery / Ready for Pickup` → `Delivered / Picked Up` (or `Cancelled`).

## 3. Front end

`index.html`, `menu.html` and `product.html` are already connected: they load `api.js` + `shop.js`, which build the product cards from the Sheet using the original design. Product links use `product.html?id=P001`; category tiles use `menu.html?category=Cookies`. The cart is saved in the browser (`Cart` in `api.js`) and the header shows `Cart (n)`.

Still to connect: checkout, confirmation and tracking.

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
