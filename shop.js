// ORIJIN – renders products from Jin's Google Sheet (via api.js).
// Used by index.html, menu.html and product.html. Load AFTER api.js.
(function () {
  const CATEGORY_ORDER = ['Bread', 'Cookies', 'Cakes', 'More'];
  const CACHE_KEY = 'orijin_products';

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel) => document.querySelector(sel);
  const priceText = (p) => (p.price > 0 ? peso(p.price) : 'Price soon');
  const productUrl = (p) => 'product.html?id=' + encodeURIComponent(p.id);

  function badge(stock, size) {
    const pad = size === 'lg' ? 'px-3 py-1' : 'px-2 py-0.5';
    const look = stock === 'Sold out'
      ? 'bg-surface-variant text-primary border border-primary/40'
      : stock === 'Low stock'
        ? 'bg-secondary text-on-secondary border border-primary'
        : 'bg-primary text-on-primary';
    return `<span class="inline-block ${look} text-label-sm font-title ${pad} rounded-full mb-1">${esc(stock)}</span>`;
  }

  function photo(p, cls) {
    return p.images.length
      ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" class="${cls}">`
      : `<div class="w-full h-full flex items-center justify-center font-headline text-headline-sm text-primary/40">ORIJIN</div>`;
  }

  function message(el, text) {
    if (el) el.innerHTML = `<p class="col-span-full text-body-xs text-primary italic text-center py-6">${esc(text)}</p>`;
  }

  // Shows the last copy right away, then refreshes with Jin's latest data
  async function loadProducts(render, onFail) {
    let shown = false;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c) { render(c); shown = true; }
    } catch (e) {}
    if (!ORIJIN_API || ORIJIN_API.indexOf('PASTE_') === 0) {
      if (!shown) onFail('The menu is not connected yet (set ORIJIN_API in api.js).');
      return;
    }
    try {
      const res = await OrijinAPI.getProducts();
      if (!res.ok) throw new Error(res.error);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.products)); } catch (e) {}
      render(res.products);
    } catch (err) {
      if (!shown) onFail('Could not load the menu. Please refresh the page.');
    }
  }

  function updateCartCount() {
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = `Cart (${Cart.count()})`;
    });
  }

  function categoriesOf(products) {
    const set = [...new Set(products.map((p) => p.category).filter(Boolean))];
    return set.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }

  // ---------- cards ----------
  function menuCard(p) {
    const btn = p.available
      ? `<button type="button" data-add="${esc(p.id)}" class="bg-primary text-on-primary px-3 py-1 rounded-full font-headline text-body-xs active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary">Add to cart</button>`
      : `<button type="button" disabled class="border-2 border-primary/40 text-primary/50 px-3 py-1 rounded-full font-headline text-body-xs cursor-not-allowed">${p.stock === 'Sold out' ? 'Sold out' : 'Unavailable'}</button>`;
    return `
      <div class="bg-surface border-2 border-primary rounded-2xl p-3 flex flex-col justify-between">
        <a href="${productUrl(p)}" class="block w-full h-32 rounded-xl overflow-hidden mb-2 bg-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          ${photo(p, 'w-full h-full object-cover')}
        </a>
        <div>
          ${badge(p.stock)}
          <h2 class="font-headline text-headline-sm text-primary leading-tight"><a href="${productUrl(p)}" class="hover:underline">${esc(p.name)}</a></h2>
          <p class="text-body-xs text-primary font-medium italic mb-2">${p.calories ? p.calories + ' cal' : '&nbsp;'}</p>
        </div>
        <div class="flex items-center justify-between pt-1">
          <span class="font-title text-body-md text-primary font-semibold">${priceText(p)}</span>
          ${btn}
        </div>
      </div>`;
  }

  function homeCard(p) {
    return `
      <div class="bg-surface border-2 border-primary rounded-2xl p-3 flex flex-col justify-between">
        <div class="w-full h-28 rounded-xl overflow-hidden mb-2 bg-surface-variant">
          ${photo(p, 'w-full h-full object-cover')}
        </div>
        <div>
          ${badge(p.stock)}
          <h3 class="font-headline text-headline-sm text-primary leading-tight">${esc(p.name)}</h3>
          <p class="text-body-xs text-primary font-medium italic mb-2">${p.calories ? p.calories + ' cal' : '&nbsp;'}</p>
        </div>
        <div class="flex items-center justify-between pt-1">
          <span class="font-title text-body-md text-primary font-semibold">${priceText(p)}</span>
          <a href="${productUrl(p)}" class="bg-primary text-on-primary px-3 py-1 rounded-full font-headline text-body-xs active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary">View</a>
        </div>
      </div>`;
  }

  // ---------- pages ----------
  function initHome() {
    const grid = $('#featuredGrid');
    if (!grid) return;
    loadProducts((products) => {
      let list = products.filter((p) => p.featured);
      if (!list.length) list = products;
      list = list.slice(0, 3);
      grid.innerHTML = list.length ? list.map(homeCard).join('') : '';
      if (!list.length) message(grid, 'New bakes coming soon!');
    }, (msg) => message(grid, msg));
  }

  function initMenu() {
    const grid = $('#productGrid'), pills = $('#categoryPills');
    if (!grid) return;
    let products = [];
    let active = new URLSearchParams(location.search).get('category') || 'All';

    const pillClass = (on) => on
      ? 'bg-primary text-on-primary px-4 py-1.5 rounded-full font-title text-body-xs active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary'
      : 'border-2 border-primary text-primary px-3.5 py-1 rounded-full font-title text-body-xs bg-surface active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary';

    function draw() {
      const cats = categoriesOf(products);
      if (active !== 'All' && cats.indexOf(active) < 0) active = 'All';
      if (pills) {
        pills.innerHTML = ['All', ...cats].map((c) =>
          `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === active}" class="${pillClass(c === active)}">${esc(c)}</button>`).join('');
      }
      const list = active === 'All' ? products : products.filter((p) => p.category === active);
      grid.innerHTML = list.map(menuCard).join('');
      if (!list.length) message(grid, products.length ? 'Nothing in this category yet.' : 'New bakes coming soon!');
    }

    if (pills) pills.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      active = b.dataset.cat;
      const url = new URL(location.href);
      if (active === 'All') url.searchParams.delete('category'); else url.searchParams.set('category', active);
      history.replaceState(null, '', url);
      draw();
    });

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      Cart.add(b.dataset.add, 1);
      updateCartCount();
      b.textContent = 'Added ✓';
      setTimeout(() => { b.textContent = 'Add to cart'; }, 1200);
    });

    loadProducts((list) => { products = list; draw(); }, (msg) => message(grid, msg));
  }

  function initProduct() {
    const root = $('#productRoot');
    if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    let qty = 1;

    loadProducts((products) => {
      const p = products.find((x) => x.id === id) || (!id && products[0]);
      if (!p) {
        root.innerHTML = `<p class="text-body-md text-primary text-center py-10">This product is not available.<br>
          <a href="menu.html" class="font-bold underline">Back to the catalog</a></p>`;
        return;
      }
      document.title = p.name + ' – ORIJIN';
      const tabs = p.images.length > 1 ? `
        <div class="grid grid-cols-3 gap-2" id="photoTabs">
          ${p.images.map((src, i) => `<button type="button" data-photo="${i}" class="py-2.5 rounded-2xl font-title text-body-xs text-primary text-center focus-visible:ring-2 focus-visible:ring-primary ${i === 0 ? 'border-2 border-primary bg-secondary/80 shadow-sm' : 'bg-secondary/40 border border-primary/20 hover:bg-secondary/60'}">Photo ${i + 1}</button>`).join('')}
        </div>` : '';
      const nut = (val, label, unit) =>
        `<div><span class="font-headline text-headline-md text-primary block leading-tight">${esc(val)}${unit}</span><span class="text-body-xs text-primary font-body">${label}</span></div>`;

      root.innerHTML = `
        <nav class="text-body-xs text-primary font-body flex items-center gap-1.5">
          <a href="menu.html" class="hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded">Catalog</a>
          <span class="text-primary font-bold">/</span>
          <a href="menu.html?category=${encodeURIComponent(p.category)}" class="hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded">${esc(p.category)}</a>
          <span class="text-primary font-bold">/</span>
          <span class="font-title text-primary">${esc(p.name)}</span>
        </nav>

        <div class="border-2 border-primary rounded-3xl overflow-hidden bg-surface-variant relative shadow-sm">
          ${p.images.length
            ? `<img id="mainPhoto" src="${esc(p.images[0])}" alt="${esc(p.name)}" class="w-full h-72 object-cover">`
            : `<div class="h-72 flex items-center justify-center font-headline text-headline-md text-primary/40">ORIJIN</div>`}
        </div>
        ${tabs}

        <div class="flex flex-col gap-3 pt-2">
          <div>
            ${badge(p.stock, 'lg')}
            <h1 class="font-headline text-display-lg-mobile text-primary leading-tight">${esc(p.name)}</h1>
            <p class="font-title text-title-lg text-primary mt-1 font-semibold">${priceText(p)}</p>
          </div>
          ${p.description ? `<p class="text-body-xs text-primary italic leading-relaxed">${esc(p.description)}</p>` : ''}
          ${p.ingredients ? `<p class="text-body-xs text-primary italic leading-relaxed"><span class="font-bold not-italic">Ingredients:</span> ${esc(p.ingredients)}</p>` : ''}

          <div class="border-2 border-primary rounded-3xl p-4 bg-surface mt-1">
            <h2 class="font-headline text-headline-sm text-primary mb-3">Nutritional Value</h2>
            <div class="grid grid-cols-4 text-center divide-x divide-primary/10">
              ${nut(p.calories, 'calories', '')}${nut(p.protein, 'Protein', 'g')}${nut(p.carbs, 'Carbs', 'g')}${nut(p.fat, 'Fat', 'g')}
            </div>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <div class="flex items-center justify-between border-2 border-primary rounded-full px-4 py-2 w-32 bg-surface">
              <button type="button" id="qtyMinus" class="font-headline text-headline-sm text-primary leading-none active:scale-90 focus-visible:ring-2 focus-visible:ring-primary rounded-full" aria-label="Decrease quantity">-</button>
              <span id="qtyValue" class="font-headline text-title-md text-primary">${qty}</span>
              <button type="button" id="qtyPlus" class="font-headline text-headline-sm text-primary leading-none active:scale-90 focus-visible:ring-2 focus-visible:ring-primary rounded-full" aria-label="Increase quantity">+</button>
            </div>
            ${p.available
              ? `<button type="button" id="addToCart" class="flex-1 bg-primary text-on-primary py-3 rounded-full font-headline text-title-md text-center shadow-md active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary">Add to cart</button>`
              : `<button type="button" disabled class="flex-1 border-2 border-primary/40 text-primary/50 py-3 rounded-full font-headline text-title-md text-center cursor-not-allowed">${p.stock === 'Sold out' ? 'Sold out' : 'Unavailable'}</button>`}
          </div>
        </div>`;

      const setQty = (n) => { qty = Math.max(1, Math.min(50, n)); $('#qtyValue').textContent = qty; };
      $('#qtyMinus').onclick = () => setQty(qty - 1);
      $('#qtyPlus').onclick = () => setQty(qty + 1);
      const add = $('#addToCart');
      if (add) add.onclick = () => { Cart.add(p.id, qty); location.href = 'checkout.html'; };

      const tabsEl = $('#photoTabs');
      if (tabsEl) tabsEl.onclick = (e) => {
        const b = e.target.closest('[data-photo]');
        if (!b) return;
        $('#mainPhoto').src = p.images[Number(b.dataset.photo)];
        tabsEl.querySelectorAll('[data-photo]').forEach((x) => {
          const on = x === b;
          x.className = 'py-2.5 rounded-2xl font-title text-body-xs text-primary text-center focus-visible:ring-2 focus-visible:ring-primary ' +
            (on ? 'border-2 border-primary bg-secondary/80 shadow-sm' : 'bg-secondary/40 border border-primary/20 hover:bg-secondary/60');
        });
      };
    }, (msg) => { root.innerHTML = `<p class="text-body-md text-primary text-center py-10">${esc(msg)}</p>`; });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    initHome();
    initMenu();
    initProduct();
  });
})();
