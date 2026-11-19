# ORIJIN – Online Pastry Shop

An ordering website for Jin's pastry business. Customers browse the menu, add items to their cart, choose delivery or pick-up, and track their order. Jin manages the menu and orders from a Google Sheet, with no coding needed.

**Live site:** https://darrie-andrei-dizon.github.io/The-Ori-jin/ (works once GitHub Pages is turned on, step 3 below)

## How it works

| Part | What it is | Where it lives |
| --- | --- | --- |
| Website (front end) | HTML pages styled with Tailwind | This repo, published by GitHub Pages |
| Backend | Google Apps Script web app | `backend/Code.gs`, pasted into the Google Sheet |
| Database and admin panel | Google Sheet with **Products**, **Orders** and **Settings** tabs | Jin's Google Drive |

The website asks the Apps Script for the menu and sends orders to it. The script reads and writes the Google Sheet.

## Setup (do this once, in order)

### 1. Create the Google Sheet and backend

1. Go to [sheets.new](https://sheets.new) and name the Sheet **ORIJIN Orders**.
2. Click **Extensions → Apps Script**.
3. Delete the sample code, paste in **all** of [`backend/Code.gs`](backend/Code.gs), and click **Save** (💾).
4. In the function dropdown at the top, choose **`setup`** and click **Run**.
5. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced → Go to (project name) → Allow**. This warning is normal for your own scripts.
6. Go back to the Sheet. You should now see the **Products**, **Orders** and **Settings** tabs. Reload the Sheet and an **ORIJIN** menu appears at the top.

### 2. Publish the backend

1. In Apps Script, click **Deploy → New deployment**.
2. Click the ⚙️ next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
4. Copy the **Web app URL**. It ends in `/exec`.
5. Test it: paste the URL into your browser. You should see `{"ok":true,"message":"ORIJIN API is running"}`.
6. In this repo, open [`api.js`](api.js) and click ✏️ **Edit**. Replace `PASTE_YOUR_EXEC_URL_HERE` with your URL and keep the quotes:
   ```js
   const ORIJIN_API = 'https://script.google.com/macros/s/AKfy.../exec';
   ```
   Then click **Commit changes**.

### 3. Turn on GitHub Pages

1. In this repo, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, and click **Save**.
3. Wait 1–2 minutes, then open https://darrie-andrei-dizon.github.io/The-Ori-jin/

The menu should now show the three sample products from the Sheet.

### 4. Fill in the real menu

In the Sheet's **Products** tab, replace the sample prices, descriptions, ingredients and photos. In **Settings**, set `DELIVERY_FEE`, `NOTIFY_EMAIL` (Jin's email) and `PAYMENT_INSTRUCTIONS`.

## Updating things later

| Change | What to do |
| --- | --- |
| Menu items, prices, photos | Edit the **Products** tab. The site updates on the next page load. |
| Website pages (HTML, CSS, JS) | Commit to `main`. GitHub Pages republishes in about a minute. |
| `backend/Code.gs` | Paste the new code into Apps Script, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The `/exec` URL stays the same. |

## Guide for Jin

Everything is in the **Products** tab. Hover over any column title for a hint, or use **ORIJIN → How to edit the menu**.

- **Change a price, description or ingredients:** edit the cell.
- **Add a product:** **ORIJIN → Add a new product**, or type a name in the next empty row. The ID fills in by itself.
- **Add a photo:** upload it to Google Drive, then **Share → Copy link**. Paste the link in **Photo 1**, then click **ORIJIN → Make product photos viewable on the website**.
- **Sold out:** set **Stock** to `Sold out`. The item stays visible but can't be ordered.
- **Hide a product:** tick **Hidden**.
- **Home page items:** tick **Featured on Home** for up to 3 products.
- **Orders:** change the **Status** dropdown in the **Orders** tab. The time stamps fill in by themselves.

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
backend/README.md  Technical details and code snippets for the remaining pages
```

## Troubleshooting

- **The menu says "The menu is not connected yet":** `api.js` still has `PASTE_YOUR_EXEC_URL_HERE` (step 2.6).
- **The menu says "Could not load the menu":** open the `/exec` URL in your browser. If it doesn't show `"ok":true`, redeploy with **Who has access: Anyone**.
- **Sheet changes don't show:** reload the page. If they still don't show, use **ORIJIN → Update the website now**.
- **A Drive photo doesn't show:** run **ORIJIN → Make product photos viewable on the website**, or set that photo to "Anyone with the link" in Drive.
- **Backend code changes don't take effect:** deploy a **New version** (see Updating things later).
- **The site shows a 404:** GitHub Pages isn't on yet, or it's still publishing. Wait a minute and check **Settings → Pages**.
