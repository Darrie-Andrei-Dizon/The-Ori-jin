# ORIJIN – Developer Guide

Technical setup and integration notes for the team. Jin's guide to running the shop is the [main README](../README.md).

The backend is a Google Sheet + Google Apps Script web app. The Sheet is the database **and** Jin's admin panel. The website is static HTML on GitHub Pages and calls the web app through `api.js`.

**Live site:** https://darrie-andrei-dizon.github.io/The-Ori-jin/

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
6. Paste that URL into `ORIJIN_API` at the top of `api.js` (already done for the current deployment).
7. GitHub Pages: repo **Settings → Pages** → Source **Deploy from a branch**, Branch **main**, folder **/ (root)**.

> After **any** change to `Code.gs`: Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy.
> Otherwise the live URL keeps running the old code.

## 2. Sheet layout

- **Products**: one row per item. The code finds columns by header name, so columns can be moved. Running `setup()` again adds any missing columns and keeps existing data.
- **Orders**: one row per order. `onEdit` stamps **Paid At**, **Ready At** and **Completed At** when **Status** changes. **Items JSON** is hidden and used by tracking.
- **Settings**: `SHOP_NAME`, `DELIVERY_FEE`, `NOTIFY_EMAIL`, `PAYMENT_INSTRUCTIONS`.

Products are cached for 5 minutes; any edit to the Products tab clears the cache, and so does **ORIJIN → Update the website now**. Orders always read fresh prices and stock.

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

## Updating the code

| Change | What to do |
| --- | --- |
| Website pages (HTML, CSS, JS) | Commit to `main`; GitHub Pages republishes in about a minute. |
| `backend/Code.gs` | Paste into Apps Script, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The `/exec` URL stays the same. |

## Project files

```
index.html         Home page (featured products, categories, order lookup)
menu.html          Catalog with category filters
product.html       Product details (product.html?id=P001)
checkout.html      Checkout            (not yet connected to the backend)
confirmation.html  Order confirmation  (not yet connected)
tracking.html      Order tracking      (not yet connected)
login.html         Login               (design only; checkout works as guest)
api.js             Backend URL, API calls and cart
shop.js            Builds the product cards from the Sheet
images/            Product photos
backend/Code.gs    Google Apps Script backend
```

## Troubleshooting

- **"The menu is not connected yet"**: `ORIJIN_API` in `api.js` is still the placeholder.
- **"Could not load the menu"**: open the `/exec` URL in a browser. If it doesn't return `"ok":true`, redeploy with **Who has access: Anyone**.
- **Backend changes don't take effect**: deploy a **New version**.
- **404 on the site**: GitHub Pages is off or still publishing; check **Settings → Pages**.
