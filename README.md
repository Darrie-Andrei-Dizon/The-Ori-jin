# ORIJIN – Shop Guide for Jin

This is your online pastry shop. Customers see your menu on the website. You run everything from one Google Sheet. You don't need to touch any code or this GitHub page.

| | Link |
| --- | --- |
| **Your website** | https://darrie-andrei-dizon.github.io/The-Ori-jin/ |
| **Your shop Sheet** | The Google Sheet the team shared with you. Find it in [Google Drive](https://drive.google.com) under **Shared with me**. |

Anything you change in the Sheet shows on the website the next time a customer opens or refreshes the page. There's no save or publish button: Google Sheets saves by itself.

The Sheet has three tabs at the bottom:

- **Products** is your menu.
- **Orders** is where customer orders arrive.
- **Settings** holds your delivery fee, payment instructions and notification email.

---

## Before you open the shop

The website is showing sample content right now. Replace it first:

- [ ] Put your real **prices** in **Products**.
- [ ] Replace "Replace with a short description." and the sample **ingredients** for each product.
- [ ] Add **calories, protein, carbs and fat**, or leave them at 0 if you don't know them.
- [ ] Add your own **photos** (see [Add or change a photo](#add-or-change-a-photo)).
- [ ] Add the rest of your menu.
- [ ] In **Settings**, put your real GCash or Maya number in `PAYMENT_INSTRUCTIONS`.
- [ ] In **Settings**, put your email in `NOTIFY_EMAIL` so you get an email for every new order.
- [ ] Check that `DELIVERY_FEE` (currently ₱80) is right.

---

## Updating your menu

Everything below happens in the **Products** tab. Not sure what goes in a column? Hover your mouse over the column title and a note pops up. You can also open the **ORIJIN** menu at the top of the Sheet and choose **How to edit the menu**.

### Change a price, description or ingredients

1. Click the cell you want to change.
2. Type the new text or number and press **Enter**.

For prices, type the number only (for example `85`, not `₱85`).

### Add a new product

1. Click **ORIJIN → Add a new product**. A new row appears with an ID already filled in.
2. Type the **Name**, then pick a **Category** and type the **Price**.
3. Fill in the **Short Description**, **Ingredients** and **Photo 1**.

You can also just type a name in the first empty row. The ID fills in by itself.

### Add or change a photo

1. Upload the photo to your [Google Drive](https://drive.google.com).
2. Right-click the photo, then choose **Share → Copy link**.
3. Paste the link into **Photo 1** for that product. **Photo 2** and **Photo 3** are optional extra photos customers can flip through.
4. Click **ORIJIN → Make product photos viewable on the website**.

Step 4 lets customers see the photo. Without it, the photo shows as blank. Square or landscape photos look best.

### Mark something as sold out

Set **Stock** to **Sold out**. The product stays on the menu so customers know it exists, but they can't add it to their cart. Change it back to **In stock** when it's available again. Choose **Low stock** to show a "Low stock" badge.

### Take a product off the website

Tick the **Hidden** box. To bring it back, untick it. Don't delete the row, because old orders still refer to it.

### Choose what shows on the home page

Tick **Featured on Home** for up to 3 products. They appear under "Fresh from the oven."

### Add a new category

Type the new category name in the **Category** column (for example `Pies`). It appears as a filter button on the menu page by itself. The four home page tiles stay as Bread, Cookies, Cakes and More.

### What each column means

| Column | What to put in it |
| --- | --- |
| **ID** | Filled in for you. Don't change it. |
| **Name** | The product name customers see |
| **Category** | Bread, Cookies, Cakes, More, or a new one |
| **Price (PHP)** | Numbers only, for example `85` |
| **Stock** | In stock, Low stock or Sold out |
| **Short Description** | One or two sentences about the product |
| **Ingredients** | Separated by commas: `flour, butter, eggs` |
| **Calories, Protein, Carbs, Fat** | Per piece. Leave 0 if unknown |
| **Photo 1, 2, 3** | Google Drive photo links |
| **Featured on Home** | Tick to show on the home page |
| **Hidden** | Tick to hide from the website |

---

## Handling orders

> **Coming soon:** online checkout is still being connected. Until the team tells you it's live, customers can browse the menu but can't place orders through the website, so keep taking orders by message for now.

Once it's live, this is how an order works:

1. A customer places an order. It appears as a new row in the **Orders** tab, you get an email (if `NOTIFY_EMAIL` is set), and the customer gets an email with their order number, for example **OJ00001**.
2. The customer pays using your `PAYMENT_INSTRUCTIONS`.
3. You move the order along by changing the **Status** dropdown. The time stamps fill in by themselves, and the customer sees each step when they track their order.

| Change Status to… | When |
| --- | --- |
| **For Payment** | Set by itself for every new order |
| **For Baking** | After you've received their payment |
| **For Delivery / Ready for Pickup** | When it's baked and packed |
| **Delivered / Picked Up** | When the customer has it |
| **Cancelled** | If the order won't go ahead |

Customers track an order on the home page under **Where's my order?** with their order number and email. The **Internal Notes** column is only for you; customers never see it.

---

## Shop settings

In the **Settings** tab, edit the **Value** column only:

| Key | What it does |
| --- | --- |
| `SHOP_NAME` | Your shop name in customer emails |
| `DELIVERY_FEE` | Added to delivery orders, in pesos. Pick-up orders have no fee |
| `NOTIFY_EMAIL` | Where new-order emails go. Leave it blank to turn them off |
| `PAYMENT_INSTRUCTIONS` | How customers should pay you, shown in their confirmation email |

---

## Using your phone

You can update prices, stock, descriptions and order statuses from the **Google Sheets app** on your phone, and dropdowns and checkboxes work there too. The **ORIJIN** menu only shows up on a computer, so add new products and make photos viewable from a laptop.

---

## Do's and don'ts

- **Do** use **Hidden** or **Sold out** instead of deleting products.
- **Do** type prices as plain numbers.
- **Don't** change the **ID** column or the column titles in the top row.
- **Don't** rename the **Products**, **Orders** or **Settings** tabs.
- **Don't** edit the Apps Script code (Extensions → Apps Script). Ask the team instead.

---

## Something not right?

| Problem | Try this |
| --- | --- |
| My change isn't on the website | Refresh the website page. If it still doesn't show, click **ORIJIN → Update the website now** and refresh again. |
| A photo shows blank | Click **ORIJIN → Make product photos viewable on the website**. Also check that the link in **Photo 1** is a Google Drive link. |
| I can't see the ORIJIN menu | Refresh the Sheet and wait a few seconds. It only appears on a computer, not the phone app. |
| Google says "This app isn't verified" | This is normal for your own shop tools. Click **Advanced → Go to… (unsafe) → Allow**. It only asks once. |
| A product disappeared | Check that **Hidden** isn't ticked and that the row has both an **ID** and a **Name**. |
| A customer can't order an item | Check that **Stock** isn't **Sold out** and that it has a **Price**. |
| The website won't load at all | Contact the team. |

---

**Need help?** Contact the ORIJIN dev team. Technical notes for the team are in the [developer guide](backend/README.md).
