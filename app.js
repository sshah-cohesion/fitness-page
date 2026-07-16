(function () {
  "use strict";

  var GYMS = window.GYMS || [];
  var STORE_KEY = "fitness_memberships";
  var state = { filter: "all", query: "", view: "discover", activeGym: null, activeTier: null };

  var grid = document.getElementById("grid");
  var empty = document.getElementById("empty");
  var chipsWrap = document.getElementById("chips");
  var searchInput = document.getElementById("search");
  var modal = document.getElementById("modal");
  var toastEl = document.getElementById("toast");
  var mmList = document.getElementById("mm-list");
  var mmEmpty = document.getElementById("mm-empty");
  var toastTimer = null;

  var FALLBACKS = {
    strength: "linear-gradient(135deg,#4c5bd4,#7a5cff)",
    yoga: "linear-gradient(135deg,#18a06b,#3fc79a)",
    cycle: "linear-gradient(135deg,#e23744,#ff7a59)",
    boxing: "linear-gradient(135deg,#232746,#4c5bd4)",
  };

  function money(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function mapUrl(addr) { return "https://maps.google.com/?q=" + encodeURIComponent(addr); }
  function shortAddr(a) { return a.replace(/,\s*IL\s*\d{5}$/, "").replace(/,\s*Chicago.*$/, ", Chicago"); }

  function starSvg() {
    return '<svg class="star" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z"/></svg>';
  }

  function applyFallback(img) {
    var key = img.getAttribute("data-fallback") || "strength";
    img.parentElement.style.background = FALLBACKS[key] || FALLBACKS.strength;
    img.style.display = "none";
  }
  function wireFallback(img) {
    img.addEventListener("error", function () { applyFallback(img); });
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) applyFallback(img);
  }

  function badgePill(b) {
    var cls = { new: "pill-new", popular: "pill-popular", limited: "pill-limited" }[b.type] || "";
    return '<span class="pill ' + cls + '">' + b.label + "</span>";
  }

  function matches(gym) {
    var f = state.filter;
    var okFilter = f === "all" || (gym.tags || []).indexOf(f) !== -1;
    var q = state.query.trim().toLowerCase();
    var okQuery = !q ||
      gym.name.toLowerCase().indexOf(q) !== -1 ||
      gym.category.toLowerCase().indexOf(q) !== -1 ||
      gym.address.toLowerCase().indexOf(q) !== -1;
    return okFilter && okQuery;
  }

  function renderGrid() {
    var list = GYMS.filter(matches);
    grid.innerHTML = "";
    empty.hidden = list.length !== 0;

    list.forEach(function (gym) {
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<div class="card-media">' +
          '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="' + gym.name + '" loading="lazy" />' +
          '<div class="card-badges">' + (gym.badges || []).map(badgePill).join("") + "</div>" +
          '<span class="card-rating">' + starSvg() + gym.rating.toFixed(1) + "</span>" +
        "</div>" +
        '<div class="card-body">' +
          "<h4>" + gym.name + "</h4>" +
          '<span class="card-cat">' + gym.category + "</span>" +
          '<a class="addr" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="2"/></svg>' +
            '<span class="addr-txt">' + shortAddr(gym.address) + "</span>" +
          "</a>" +
          '<span class="card-dist">' + gym.distance + "</span>" +
          '<div class="card-foot">' +
            '<span class="price"><b>' + money(gym.priceFrom) + '</b><span>from · member rate</span></span>' +
            '<button class="btn btn-ghost" data-buy="' + gym.id + '">Buy membership</button>' +
          "</div>" +
        "</div>";
      grid.appendChild(card);
      wireFallback(card.querySelector("img"));
    });
  }

  // ---------- My Membership ----------
  function getMemberships() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveMembership(entry) {
    var all = getMemberships();
    all.unshift(entry);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) {}
  }

  function renderMemberships() {
    var all = getMemberships();
    mmEmpty.hidden = all.length !== 0;
    mmList.innerHTML = "";
    all.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "mm-card";
      el.innerHTML =
        '<img class="mm-thumb" data-fallback="' + m.fallback + '" src="' + m.img + '" alt="' + m.name + '" />' +
        '<div class="mm-info">' +
          "<h4>" + m.name + "</h4>" +
          '<div class="mm-tier">' + m.tier + " · " + (m.price === 0 ? "Free" : money(m.price) + " " + m.unit) + "</div>" +
          '<div class="mm-meta">' + m.category + " · Purchased " + m.date + "</div>" +
          '<span class="mm-status">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Active</span>' +
        "</div>";
      mmList.appendChild(el);
      wireFallback(el.querySelector("img"));
    });
  }

  // ---------- Views (deep-linkable via URL hash) ----------
  var VIEW_LABELS = { discover: "Discover", studios: "Studios", membership: "My Membership" };

  function setView(view, opts) {
    if (!VIEW_LABELS[view]) view = "discover";
    state.view = view;
    document.body.className = "view-" + view;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === view);
    });
    var crumb = document.getElementById("crumb-view");
    if (crumb) crumb.textContent = VIEW_LABELS[view];
    document.title = "Fitness · " + VIEW_LABELS[view];

    // Keep the URL in sync so each view is its own shareable custom link.
    if (!(opts && opts.fromHash) && location.hash.replace(/^#/, "") !== view) {
      location.hash = view;
    }

    if (view === "membership") renderMemberships();
    else renderGrid();
    if (!(opts && opts.silent)) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Modal ----------
  function openModal(gym) {
    state.activeGym = gym;
    state.activeTier = null;

    document.getElementById("m-title").textContent = gym.name;
    document.getElementById("m-sub").textContent = gym.category + " · " + gym.distance;
    var img = document.getElementById("m-img");
    img.setAttribute("data-fallback", gym.fallback);
    img.style.display = ""; img.parentElement.style.background = "";
    img.src = gym.img; img.alt = gym.name;
    wireFallback(img);

    var tiersWrap = document.getElementById("m-tiers");
    tiersWrap.innerHTML = "";
    gym.tiers.forEach(function (tier, i) {
      var el = document.createElement("button");
      el.className = "tier";
      el.innerHTML =
        '<span class="tier-radio"></span>' +
        '<span class="tier-info"><b>' + tier.name +
          (tier.tag ? '<span class="tier-tag">' + tier.tag + "</span>" : "") +
          "</b><span>" + tier.note + "</span></span>" +
        '<span class="tier-price"><b>' + (tier.price === 0 ? "Free" : money(tier.price)) + "</b>" +
          "<span>" + tier.unit + "</span></span>";
      el.addEventListener("click", function () { selectTier(i); });
      tiersWrap.appendChild(el);
    });

    tiersWrap.hidden = false;
    document.getElementById("m-checkout").hidden = true;
    document.getElementById("m-success").hidden = true;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function selectTier(i) {
    state.activeTier = i;
    var tier = state.activeGym.tiers[i];
    Array.prototype.forEach.call(document.querySelectorAll(".tier"), function (t, idx) {
      t.classList.toggle("is-active", idx === i);
    });
    document.getElementById("m-selected").textContent =
      tier.name + " — " + (tier.price === 0 ? "Free" : money(tier.price) + " " + tier.unit);
    document.getElementById("m-checkout").hidden = false;
    document.getElementById("m-checkout").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function confirmBuy() {
    var gym = state.activeGym;
    var tier = gym.tiers[state.activeTier];
    saveMembership({
      name: gym.name, category: gym.category, img: gym.img, fallback: gym.fallback,
      tier: tier.name, price: tier.price, unit: tier.unit,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    document.getElementById("m-tiers").hidden = true;
    document.getElementById("m-checkout").hidden = true;
    document.getElementById("m-success-text").textContent =
      "Your " + tier.name + " membership at " + gym.name + " is confirmed. Find your digital pass in My Membership.";
    document.getElementById("m-success").hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // ---------- Events ----------
  chipsWrap.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    state.filter = chip.getAttribute("data-filter");
    Array.prototype.forEach.call(chipsWrap.children, function (c) {
      c.classList.toggle("is-active", c === chip);
    });
    renderGrid();
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value;
    renderGrid();
  });

  document.addEventListener("click", function (e) {
    var buyBtn = e.target.closest("[data-buy]");
    if (buyBtn) {
      var id = buyBtn.getAttribute("data-buy");
      var gym = id === "featured" ? GYMS[0] : GYMS.find(function (g) { return g.id === id; });
      if (gym) openModal(gym);
      return;
    }
    var goto = e.target.closest("[data-goto]");
    if (goto) { setView(goto.getAttribute("data-goto")); }
    if (e.target.closest("[data-close]")) closeModal();
  });

  document.getElementById("m-confirm").addEventListener("click", confirmBuy);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  document.querySelector(".tabs").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    setView(tab.getAttribute("data-tab"));
  });

  // Featured hero setup
  var fImg = document.querySelector(".featured-media img");
  if (fImg) wireFallback(fImg);
  var f = GYMS[0];
  if (f) {
    document.getElementById("featured-addr").href = mapUrl(f.address);
    document.getElementById("featured-rating").innerHTML =
      starSvg() + f.rating.toFixed(1) + ' <span class="rev">(' + f.reviews + " reviews)</span>";
  }

  // React to back/forward and direct hash links (e.g. site.com/#studios)
  window.addEventListener("hashchange", function () {
    setView(location.hash.replace(/^#/, "") || "discover", { fromHash: true });
  });

  // Open on the view named in the URL hash, defaulting to Discover.
  setView(location.hash.replace(/^#/, "") || "discover", { fromHash: true, silent: true });
})();
