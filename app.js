(function () {
  "use strict";

  var BUILDING = window.BUILDING || { name: "125 Park Avenue", address: "125 Park Avenue, New York, NY 10017", short: "125 Park Ave" };
  var BUILDING_GYMS = window.BUILDING_GYMS || [];
  var GYMS = window.GYMS || [];
  var EVENT_TEMPLATES = window.EVENT_TEMPLATES || [];
  var STORE_KEY = "fitness_v2_gym_passes";
  var RSVP_KEY = "fitness_v2_event_rsvps";
  var VIEWS = { discover: "Discover", events: "Events", studios: "Studios", passes: "My Passes" };

  var state = {
    filter: "all",
    query: "",
    view: "discover",
    calMonth: null,
    selectedDate: null,
    events: [],
    detail: null,
  };

  var grid = document.getElementById("grid");
  var empty = document.getElementById("empty");
  var chipsWrap = document.getElementById("chips");
  var searchInput = document.getElementById("search");
  var sheet = document.getElementById("sheet");
  var sheetBody = document.getElementById("sheet-body");
  var detailPage = document.getElementById("detail-page");
  var detailBody = document.getElementById("detail-body");
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  var FALLBACKS = {
    strength: "linear-gradient(135deg,#4c5bd4,#7a5cff)",
    yoga: "linear-gradient(135deg,#18a06b,#3fc79a)",
    cycle: "linear-gradient(135deg,#e23744,#ff7a59)",
    boxing: "linear-gradient(135deg,#232746,#4c5bd4)",
  };

  var TYPE_LABELS = {
    yoga: "Yoga",
    strength: "Strength",
    recovery: "Recovery",
    boxing: "Boxing",
    cardio: "Cardio",
  };

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function mapUrl(addr) {
    return "https://maps.google.com/?q=" + encodeURIComponent(addr);
  }
  function shortAddr(a) {
    return a
      .replace(/,\s*NY\s*\d{5}$/, "")
      .replace(/,\s*New York.*$/, ", New York")
      .replace(/\s·\s.*$/, "");
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function formatDayLabel(d) {
    var today = startOfDay(new Date());
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, addDays(today, 1))) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  function formatLongDate(d) {
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  function formatShortDate(d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function chevronSvg() {
    return '<svg class="row-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function starSvg() {
    return '<svg class="star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z"/></svg>';
  }

  function applyFallback(img) {
    var key = img.getAttribute("data-fallback") || "strength";
    img.parentElement.style.background = FALLBACKS[key] || FALLBACKS.strength;
    img.style.display = "none";
  }
  function wireFallback(img) {
    if (!img) return;
    img.addEventListener("error", function () { applyFallback(img); });
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) applyFallback(img);
  }

  function badgePill(b) {
    var cls = { new: "pill-new", popular: "pill-popular", limited: "pill-limited" }[b.type] || "";
    return '<span class="pill ' + cls + '">' + escapeHtml(b.label) + "</span>";
  }

  function randomToken(bytes) {
    var n = bytes || 8;
    var arr = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(arr, function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("").toUpperCase();
  }

  function passCode(gymId) {
    return ["COH", BUILDING.short.replace(/\s+/g, ""), gymId, Date.now().toString(36).toUpperCase(), randomToken(8)].join("|");
  }

  function makeMemberId(gymId) {
    var seed = gymId + "|" + randomToken(4);
    var hash = 0;
    for (var i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    var n = Math.abs(hash % 1000000);
    return "PA-" + pad(Math.floor(n / 1000)) + "-" + pad(n % 1000);
  }

  // ---------- Storage ----------
  function migrateLegacyStorage() {
    try {
      if (!localStorage.getItem(STORE_KEY) && localStorage.getItem("fitness_building_gyms")) {
        localStorage.setItem(STORE_KEY, localStorage.getItem("fitness_building_gyms"));
      }
      if (!localStorage.getItem(RSVP_KEY) && localStorage.getItem("fitness_event_rsvps")) {
        localStorage.setItem(RSVP_KEY, localStorage.getItem("fitness_event_rsvps"));
      }
    } catch (e) {}
  }
  migrateLegacyStorage();

  function getPasses() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function writePasses(all) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function savePass(entry) {
    var all = getPasses();
    if (all.some(function (x) { return x.id === entry.id; })) return false;
    all.unshift(entry);
    writePasses(all);
    return true;
  }
  function updatePass(id, patch) {
    var all = getPasses();
    var idx = -1;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) { idx = i; break; }
    if (idx < 0) return null;
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) all[idx][k] = patch[k];
    writePasses(all);
    return all[idx];
  }
  function rotatePassQr(passId) {
    return updatePass(passId, {
      code: passCode(passId),
      codeUpdatedAt: new Date().toISOString(),
    });
  }
  function isSignedUp(id) {
    return getPasses().some(function (x) { return x.id === id; });
  }
  function getPass(id) {
    return getPasses().find(function (x) { return x.id === id; });
  }
  function getRsvps() {
    try { return JSON.parse(localStorage.getItem(RSVP_KEY)) || []; }
    catch (e) { return []; }
  }
  function setRsvps(all) {
    try { localStorage.setItem(RSVP_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function hasRsvp(eventId) {
    return getRsvps().indexOf(eventId) >= 0;
  }
  function addRsvp(eventId) {
    var all = getRsvps();
    if (all.indexOf(eventId) === -1) {
      all.push(eventId);
      setRsvps(all);
    }
  }
  function removeRsvp(eventId) {
    setRsvps(getRsvps().filter(function (id) { return id !== eventId; }));
  }

  function buildEvents() {
    var today = startOfDay(new Date());
    state.events = EVENT_TEMPLATES.map(function (t) {
      var date = addDays(today, t.offsetDays);
      return {
        id: t.id + "-" + dateKey(date),
        baseId: t.id,
        title: t.title,
        type: t.type,
        place: t.place,
        time: t.time,
        spots: t.spots,
        description: t.description,
        date: date,
        key: dateKey(date),
      };
    });
  }
  function eventsOn(date) {
    var key = dateKey(date);
    return state.events.filter(function (e) { return e.key === key; });
  }
  function findEvent(id) {
    return state.events.find(function (e) { return e.id === id; });
  }

  // ---------- Sheet (QR only, no history) ----------
  function openSheet(html, opts) {
    sheetBody.innerHTML = html;
    sheet.hidden = false;
    document.body.classList.add("sheet-open");
    if (opts && opts.afterRender) opts.afterRender(sheetBody);
  }
  function closeSheet() {
    sheet.hidden = true;
    sheetBody.innerHTML = "";
    document.body.classList.remove("sheet-open");
  }

  function renderQrCanvas(container, payload) {
    var canvas = container && container.querySelector("canvas");
    if (!canvas || typeof QRCode === "undefined") {
      if (container) {
        container.innerHTML =
          '<img class="qr-fallback" alt="Access QR" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
          encodeURIComponent(payload) + '" />';
      }
      return;
    }
    QRCode.toCanvas(canvas, payload, {
      width: 200,
      margin: 1,
      color: { dark: "#1c2230", light: "#ffffff" },
    }, function () {});
  }

  function confirmSignup(gymId) {
    var gym = BUILDING_GYMS.find(function (g) { return g.id === gymId; });
    if (!gym || isSignedUp(gymId)) return;
    var entry = {
      id: gym.id,
      name: gym.name,
      location: gym.location,
      img: gym.img,
      fallback: gym.fallback,
      code: passCode(gym.id),
      memberId: makeMemberId(gym.id),
      codeUpdatedAt: new Date().toISOString(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    savePass(entry);
    toast("You're in — QR pass ready");
    openPassSheet(entry, { justJoined: true });
    renderBuildingGyms();
    renderFeatured();
    if (state.detail && state.detail.kind === "gym" && state.detail.id === gymId) {
      openDetail({ kind: "gym", id: gymId });
    }
    if (state.view === "passes") renderPasses();
  }

  function openPassSheet(pass, opts) {
    var fresh = rotatePassQr(pass.id) || pass;
    if (!fresh.code || fresh === pass) {
      fresh = Object.assign({}, pass, {
        code: passCode(pass.id),
        codeUpdatedAt: new Date().toISOString(),
      });
      if (getPass(pass.id)) updatePass(pass.id, { code: fresh.code, codeUpdatedAt: fresh.codeUpdatedAt });
    }
    openSheet(
      '<div class="pass-sheet">' +
        (opts && opts.justJoined ? '<p class="pass-banner">You\'re signed up</p>' : "") +
        '<h2 id="sheet-title">' + escapeHtml(fresh.name) + "</h2>" +
        '<p class="pass-sub">Show this QR at the door for access</p>' +
        '<div class="qr-wrap" id="qr-wrap"><canvas></canvas></div>' +
        '<p class="qr-rotate-note">One-time code · refreshes each time you open this pass</p>' +
        '<div class="pass-meta">' +
          "<div><span>Member ID</span><strong>" + escapeHtml(fresh.memberId) + "</strong></div>" +
          "<div><span>Location</span><strong>" + escapeHtml(fresh.location) + "</strong></div>" +
          "<div><span>Building</span><strong>" + escapeHtml(BUILDING.name) + "</strong></div>" +
          "<div><span>Status</span><strong class=\"ok\">Active</strong></div>" +
        "</div>" +
        '<button class="btn btn-primary btn-block" type="button" data-goto="passes">View in My Passes</button>' +
        '<button class="btn btn-ghost btn-block" type="button" data-save-pass-card="' + escapeHtml(fresh.id) + '">Save pass card</button>' +
        '<button class="btn btn-ghost btn-block" type="button" data-sheet-close>Done</button>' +
      "</div>",
      {
        afterRender: function (root) {
          renderQrCanvas(root.querySelector("#qr-wrap"), fresh.code);
        },
      }
    );
  }

  // ---------- Detail page (in-app, no browser history) ----------
  function closeDetail() {
    state.detail = null;
    detailPage.hidden = true;
    detailBody.innerHTML = "";
    document.body.classList.remove("detail-open");
    document.getElementById("app-shell").hidden = false;
  }

  function openDetail(detail) {
    state.detail = detail;
    document.getElementById("app-shell").hidden = true;
    detailPage.hidden = false;
    document.body.classList.add("detail-open");
    window.scrollTo(0, 0);

    if (detail.kind === "gym") {
      var gym = BUILDING_GYMS.find(function (g) { return g.id === detail.id; });
      if (!gym) { closeDetail(); return; }
      renderGymDetail(gym);
    } else if (detail.kind === "studio") {
      var studio = GYMS.find(function (g) { return g.id === detail.id; });
      if (!studio) { closeDetail(); return; }
      renderStudioDetail(studio);
    } else if (detail.kind === "event") {
      var ev = findEvent(detail.id);
      if (!ev) { closeDetail(); return; }
      renderEventDetail(ev);
    }
  }

  function renderGymDetail(gym) {
    var signed = isSignedUp(gym.id);
    document.getElementById("detail-nav-title").textContent = "Gym";
    detailBody.innerHTML =
      '<div class="detail-hero">' +
        '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="' + escapeHtml(gym.name) + '" />' +
        '<div class="detail-hero-badges">' +
          '<span class="pill ' + (signed ? "pill-new" : "pill-free") + '">' + (signed ? "Your pass" : "Free signup") + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="detail-content">' +
        '<span class="detail-cat">' + escapeHtml(gym.category) + "</span>" +
        "<h2>" + escapeHtml(gym.name) + "</h2>" +
        '<a class="addr" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener">' + escapeHtml(shortAddr(gym.address) || gym.location) + "</a>" +
        '<p class="detail-dist">' + escapeHtml(gym.distance) + " · " + escapeHtml(gym.hours) + "</p>" +
        '<div class="detail-divider"></div>' +
        '<span class="member-offer-label">TENANT AMENITY</span>' +
        "<h3>Complimentary access with QR pass</h3>" +
        '<p class="detail-desc">' + escapeHtml(gym.tagline) + "</p>" +
        '<ul class="perk-list">' +
          (gym.perks || []).map(function (p) {
            return "<li><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M5 12.5 10 17.5 19 7\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>" +
              escapeHtml(p) + "</li>";
          }).join("") +
        "</ul>" +
        '<div class="detail-actions">' +
          (signed
            ? '<button class="btn btn-primary btn-block" type="button" data-show-pass="' + gym.id + '">Show QR pass</button>'
            : '<button class="btn btn-primary btn-block" type="button" data-confirm-signup="' + gym.id + '">Sign up free</button>') +
          '<a class="btn btn-ghost btn-block" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener">Get directions</a>' +
        "</div>" +
      "</div>";
    wireFallback(detailBody.querySelector("img"));
  }

  function renderStudioDetail(studio) {
    document.getElementById("detail-nav-title").textContent = "Studio";
    detailBody.innerHTML =
      '<div class="detail-hero">' +
        '<img data-fallback="' + studio.fallback + '" src="' + studio.img + '" alt="' + escapeHtml(studio.name) + '" />' +
        '<div class="detail-hero-badges">' + (studio.badges || []).map(badgePill).join("") + "</div>" +
      "</div>" +
      '<div class="detail-content">' +
        '<span class="detail-cat">' + escapeHtml(studio.category) + "</span>" +
        "<h2>" + escapeHtml(studio.name) + "</h2>" +
        '<div class="detail-rating">' + starSvg() + " " + studio.rating.toFixed(1) +
          ' <span>(' + studio.reviews + " reviews)</span></div>" +
        '<a class="addr" href="' + mapUrl(studio.address) + '" target="_blank" rel="noopener">' + escapeHtml(shortAddr(studio.address)) + "</a>" +
        '<p class="detail-dist">' + escapeHtml(studio.distance) + "</p>" +
        '<div class="detail-divider"></div>' +
        '<span class="member-offer-label">NEARBY PARTNER</span>' +
        "<h3>Studio details</h3>" +
        '<p class="detail-desc">' + escapeHtml(studio.tagline) + "</p>" +
        '<div class="detail-actions">' +
          '<a class="btn btn-primary btn-block" href="' + mapUrl(studio.address) + '" target="_blank" rel="noopener">Get directions</a>' +
        "</div>" +
      "</div>";
    wireFallback(detailBody.querySelector("img"));
  }

  function renderEventDetail(ev) {
    var going = hasRsvp(ev.id);
    document.getElementById("detail-nav-title").textContent = "Event";
    detailBody.innerHTML =
      '<div class="detail-hero detail-hero-event type-' + ev.type + '">' +
        '<div class="detail-hero-event-inner">' +
          '<span class="type-pill type-' + ev.type + '">' + (TYPE_LABELS[ev.type] || ev.type) + "</span>" +
          "<h2>" + escapeHtml(ev.title) + "</h2>" +
          "<p>" + escapeHtml(formatLongDate(ev.date)) + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="detail-content">' +
        '<dl class="event-meta">' +
          "<div><dt>When</dt><dd>" + escapeHtml(ev.time) + "</dd></div>" +
          "<div><dt>Where</dt><dd>" + escapeHtml(ev.place) + "</dd></div>" +
          "<div><dt>Spots</dt><dd>" + ev.spots + " tenant spots</dd></div>" +
        "</dl>" +
        '<p class="detail-desc">' + escapeHtml(ev.description) + "</p>" +
        '<div class="detail-actions">' +
          (going
            ? '<div class="rsvp-confirmed"><strong>You\'re going</strong><span>Saved in My Passes</span></div>' +
              '<button class="btn btn-ghost btn-block" type="button" data-calendar-event="' + escapeHtml(ev.id) + '">Add to Calendar</button>' +
              '<button class="btn btn-primary btn-block" type="button" data-goto="passes">View My Passes</button>' +
              '<button class="btn btn-ghost btn-block" type="button" data-cancel-rsvp="' + ev.id + '">Cancel RSVP</button>'
            : '<button class="btn btn-primary btn-block" type="button" data-confirm-rsvp="' + ev.id + '">RSVP free</button>') +
        "</div>" +
      "</div>";
  }

  // ---------- Calendar helpers ----------
  function parseEventTimeRange(ev) {
    var parts = String(ev.time || "").split("–").map(function (s) { return s.trim(); });
    function toDate(part) {
      var m = part.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!m) return new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate(), 9, 0, 0);
      var h = parseInt(m[1], 10);
      var min = parseInt(m[2], 10);
      var ap = m[3].toUpperCase();
      if (ap === "PM" && h < 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      return new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate(), h, min, 0);
    }
    var start = toDate(parts[0] || "9:00 AM");
    var end = parts[1] ? toDate(parts[1]) : new Date(start.getTime() + 60 * 60 * 1000);
    return { start: start, end: end };
  }

  function toIcsDate(d) {
    return d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
  }

  function downloadCalendarEvent(ev) {
    var range = parseEventTimeRange(ev);
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//125 Park Avenue//Fitness//EN", "BEGIN:VEVENT",
      "UID:" + ev.id + "@fitness.parkave",
      "DTSTAMP:" + toIcsDate(new Date()),
      "DTSTART:" + toIcsDate(range.start),
      "DTEND:" + toIcsDate(range.end),
      "SUMMARY:" + ev.title.replace(/,/g, "\\,"),
      "LOCATION:" + (ev.place + ", " + BUILDING.address).replace(/,/g, "\\,"),
      "DESCRIPTION:" + String(ev.description || "").replace(/,/g, "\\,"),
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = (ev.title || "event").replace(/\s+/g, "-").toLowerCase() + ".ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Calendar file ready");
  }

  function savePassCardImage(pass) {
    var canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 980;
    var ctx = canvas.getContext("2d");
    var grad = ctx.createLinearGradient(0, 0, 720, 980);
    grad.addColorStop(0, "#4c5bd4");
    grad.addColorStop(1, "#7a5cff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 980);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundRect(ctx, 40, 40, 640, 900, 36);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 22px Inter, sans-serif";
    ctx.fillText("125 PARK AVENUE", 80, 120);
    ctx.font = "800 40px Inter, sans-serif";
    wrapText(ctx, pass.name, 80, 180, 560, 48);
    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(pass.location, 80, 280);
    ctx.fillText("Member ID  " + pass.memberId, 80, 320);
    var qrCanvas = document.querySelector("#qr-wrap canvas");
    if (qrCanvas && qrCanvas.width) {
      ctx.fillStyle = "#fff";
      roundRect(ctx, 180, 380, 360, 360, 24);
      ctx.fill();
      ctx.drawImage(qrCanvas, 200, 400, 320, 320);
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 20px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Show this QR at the door · Active pass", 360, 820);
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (pass.name || "pass").replace(/\s+/g, "-").toLowerCase() + "-pass.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Pass card saved");
    }, "image/png");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text).split(" ");
    var line = "";
    var yy = y;
    for (var n = 0; n < words.length; n++) {
      var test = line + words[n] + " ";
      if (ctx.measureText(test).width > maxWidth && n > 0) {
        ctx.fillText(line, x, yy);
        line = words[n] + " ";
        yy += lineHeight;
      } else line = test;
    }
    ctx.fillText(line, x, yy);
  }

  // ---------- Discover-style rendering ----------
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

  function renderFeatured() {
    var wrap = document.getElementById("featured-wrap");
    if (!wrap) return;
    var gym = BUILDING_GYMS[0];
    if (!gym) { wrap.innerHTML = ""; return; }
    var signed = isSignedUp(gym.id);
    wrap.innerHTML =
      '<article class="featured-card" data-detail-gym="' + gym.id + '">' +
        '<div class="featured-media">' +
          '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="' + escapeHtml(gym.name) + '" />' +
          '<span class="pill ' + (signed ? "pill-new" : "pill-free") + '">' + (signed ? "Your pass" : "New offer") + "</span>" +
        "</div>" +
        '<div class="featured-body">' +
          "<h2>" + escapeHtml(gym.name) + "</h2>" +
          '<a class="addr" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            escapeHtml(shortAddr(gym.address) || gym.location) +
          "</a>" +
          '<p class="featured-dist">' + escapeHtml(gym.distance) + "</p>" +
          '<div class="detail-divider"></div>' +
          '<span class="member-offer-label">MEMBER OFFER</span>' +
          "<h3>Free tenant signup · QR access pass</h3>" +
          '<p>' + escapeHtml(gym.tagline) + "</p>" +
          '<button class="btn btn-primary" type="button" data-detail-gym="' + gym.id + '">View details</button>' +
        "</div>" +
      "</article>";
    wireFallback(wrap.querySelector("img"));
  }

  function renderBuildingGyms() {
    var wrap = document.getElementById("building-grid");
    if (!wrap) return;
    wrap.innerHTML = "";
    BUILDING_GYMS.forEach(function (gym) {
      var signed = isSignedUp(gym.id);
      var row = document.createElement("button");
      row.type = "button";
      row.className = "discover-row";
      row.setAttribute("data-detail-gym", gym.id);
      row.innerHTML =
        '<div class="row-thumb">' +
          '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="" />' +
        "</div>" +
        '<div class="row-body">' +
          '<div class="row-badges">' +
            '<span class="pill ' + (signed ? "pill-new" : "pill-free") + '">' + (signed ? "Your pass" : "Free signup") + "</span>" +
          "</div>" +
          '<span class="row-cat">' + escapeHtml(gym.category) + "</span>" +
          '<a class="addr" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            escapeHtml(gym.location) +
          "</a>" +
          "<h3>" + escapeHtml(gym.name) + "</h3>" +
          '<p class="row-desc">' + escapeHtml(gym.tagline) + "</p>" +
          '<span class="row-meta">' + escapeHtml(gym.hours) + "</span>" +
        "</div>" +
        chevronSvg();
      wrap.appendChild(row);
      wireFallback(row.querySelector("img"));
    });
  }

  function renderTeaser() {
    var list = document.getElementById("teaser-list");
    if (!list) return;
    var today = startOfDay(new Date());
    var upcoming = state.events.filter(function (e) { return e.date >= today; }).slice(0, 4);
    list.innerHTML = "";
    upcoming.forEach(function (ev) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "teaser-card";
      el.setAttribute("data-detail-event", ev.id);
      el.innerHTML =
        '<div class="teaser-date">' +
          '<span class="teaser-dow">' + ev.date.toLocaleDateString("en-US", { weekday: "short" }) + "</span>" +
          '<span class="teaser-day">' + ev.date.getDate() + "</span>" +
        "</div>" +
        '<div class="teaser-info">' +
          '<span class="type-pill type-' + ev.type + '">' + (TYPE_LABELS[ev.type] || ev.type) + "</span>" +
          "<strong>" + escapeHtml(ev.title) + "</strong>" +
          '<span class="teaser-meta">' + escapeHtml(ev.time) + (hasRsvp(ev.id) ? " · Going" : "") + "</span>" +
        "</div>" +
        chevronSvg();
      list.appendChild(el);
    });
  }

  function renderGrid() {
    var list = GYMS.filter(matches);
    if (state.view === "discover") list = list.slice(0, 4);
    grid.innerHTML = "";
    empty.hidden = list.length !== 0;
    list.forEach(function (gym) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "discover-row";
      row.setAttribute("data-detail-studio", gym.id);
      row.innerHTML =
        '<div class="row-thumb">' +
          '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="" loading="lazy" />' +
        "</div>" +
        '<div class="row-body">' +
          '<div class="row-badges">' + (gym.badges || []).map(badgePill).join("") + "</div>" +
          '<span class="row-cat">' + escapeHtml(gym.category) + "</span>" +
          '<a class="addr" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            escapeHtml(shortAddr(gym.address)) +
          "</a>" +
          "<h3>" + escapeHtml(gym.name) + "</h3>" +
          '<p class="row-desc">' + escapeHtml(gym.tagline) + "</p>" +
          '<span class="row-meta">' + escapeHtml(gym.distance) + " · " + starSvg() + " " + gym.rating.toFixed(1) + "</span>" +
        "</div>" +
        chevronSvg();
      grid.appendChild(row);
      wireFallback(row.querySelector("img"));
    });
  }

  function renderWeekStrip() {
    var strip = document.getElementById("week-strip");
    if (!strip) return;
    var today = startOfDay(new Date());
    strip.innerHTML = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(today, i);
      var count = eventsOn(d).length;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "week-day";
      if (sameDay(d, state.selectedDate)) btn.classList.add("is-selected");
      if (sameDay(d, today)) btn.classList.add("is-today");
      btn.innerHTML =
        '<span class="wd-dow">' + d.toLocaleDateString("en-US", { weekday: "short" }) + "</span>" +
        '<span class="wd-num">' + d.getDate() + "</span>" +
        (count ? '<span class="wd-dot"></span>' : '<span class="wd-dot empty"></span>');
      (function (day) {
        btn.addEventListener("click", function () {
          state.selectedDate = day;
          state.calMonth = new Date(day.getFullYear(), day.getMonth(), 1);
          renderCalendar();
          renderWeekStrip();
        });
      })(d);
      strip.appendChild(btn);
    }
  }

  function renderCalendar() {
    var month = state.calMonth;
    var label = document.getElementById("cal-month-label");
    var calGrid = document.getElementById("cal-grid");
    if (!label || !calGrid) return;
    label.textContent = MONTHS[month.getMonth()] + " " + month.getFullYear();
    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var start = new Date(first);
    start.setDate(1 - first.getDay());
    var today = startOfDay(new Date());
    calGrid.innerHTML = "";
    for (var i = 0; i < 42; i++) {
      var day = addDays(start, i);
      var inMonth = day.getMonth() === month.getMonth();
      var dayEvents = eventsOn(day);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      if (!inMonth) btn.classList.add("is-outside");
      if (sameDay(day, today)) btn.classList.add("is-today");
      if (sameDay(day, state.selectedDate)) btn.classList.add("is-selected");
      if (dayEvents.length) btn.classList.add("has-events");
      var dots = dayEvents.slice(0, 3).map(function (e) {
        return '<span class="cal-dot type-' + e.type + '"></span>';
      }).join("");
      btn.innerHTML = '<span class="cal-num">' + day.getDate() + "</span>" +
        (dots ? '<span class="cal-dots">' + dots + "</span>" : "");
      (function (d) {
        btn.addEventListener("click", function () {
          state.selectedDate = d;
          if (d.getMonth() !== state.calMonth.getMonth()) {
            state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
          }
          renderCalendar();
          renderWeekStrip();
        });
      })(day);
      calGrid.appendChild(btn);
    }
    renderDayEvents();
  }

  function renderDayEvents() {
    var dayLabel = document.getElementById("event-day-label");
    var list = document.getElementById("event-day-list");
    var emptyEl = document.getElementById("event-empty");
    if (!list || !dayLabel) return;
    var day = state.selectedDate || startOfDay(new Date());
    dayLabel.textContent = formatDayLabel(day);
    var items = eventsOn(day);
    list.innerHTML = "";
    emptyEl.hidden = items.length !== 0;
    items.forEach(function (ev) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "event-row";
      el.setAttribute("data-detail-event", ev.id);
      el.innerHTML =
        '<span class="event-rail type-' + ev.type + '"></span>' +
        '<div class="event-row-body">' +
          '<div class="event-row-top">' +
            "<strong>" + escapeHtml(ev.title) + "</strong>" +
            (hasRsvp(ev.id) ? '<span class="rsvp-chip">Going</span>' : "") +
          "</div>" +
          '<span class="event-row-meta">' + escapeHtml(ev.time) + "</span>" +
          '<span class="event-row-meta">' + escapeHtml(ev.place) + "</span>" +
        "</div>" +
        chevronSvg();
      list.appendChild(el);
    });
  }

  function renderPasses() {
    var passes = getPasses();
    var mmList = document.getElementById("mm-list");
    var mmEmpty = document.getElementById("mm-empty");
    var gymCount = document.getElementById("gym-count");
    mmEmpty.hidden = passes.length !== 0;
    gymCount.textContent = String(passes.length);
    mmList.innerHTML = "";
    passes.forEach(function (m) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "discover-row";
      el.setAttribute("data-show-pass", m.id);
      el.innerHTML =
        '<div class="row-thumb"><img data-fallback="' + m.fallback + '" src="' + m.img + '" alt="" /></div>' +
        '<div class="row-body">' +
          '<span class="pill pill-new">Active pass</span>' +
          "<h3>" + escapeHtml(m.name) + "</h3>" +
          '<p class="row-desc">QR access · ' + escapeHtml(m.memberId) + "</p>" +
          '<span class="row-meta">' + escapeHtml(m.location) + " · Tap to show QR</span>" +
        "</div>" +
        chevronSvg();
      mmList.appendChild(el);
      wireFallback(el.querySelector("img"));
    });

    var upcoming = getRsvps().map(findEvent).filter(Boolean).sort(function (a, b) { return a.date - b.date; });
    var rsvpList = document.getElementById("rsvp-list");
    var rsvpEmpty = document.getElementById("rsvp-empty");
    document.getElementById("rsvp-count").textContent = String(upcoming.length);
    rsvpEmpty.hidden = upcoming.length !== 0;
    rsvpList.innerHTML = "";
    upcoming.forEach(function (ev) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "discover-row";
      el.setAttribute("data-detail-event", ev.id);
      el.innerHTML =
        '<div class="row-thumb row-thumb-event type-' + ev.type + '">' +
          '<span>' + ev.date.getDate() + "</span>" +
        "</div>" +
        '<div class="row-body">' +
          '<span class="type-pill type-' + ev.type + '">' + (TYPE_LABELS[ev.type] || ev.type) + "</span>" +
          "<h3>" + escapeHtml(ev.title) + "</h3>" +
          '<p class="row-desc">' + escapeHtml(ev.time) + " · " + escapeHtml(ev.place) + "</p>" +
          '<span class="rsvp-chip">Going</span>' +
        "</div>" +
        chevronSvg();
      rsvpList.appendChild(el);
    });
  }

  // ---------- Views ----------
  function syncUrl(view) {
    history.replaceState({ view: view }, "", location.pathname + location.search + "#" + view);
  }

  function setView(view, opts) {
    if (!VIEWS[view]) view = "discover";
    closeDetail();
    state.view = view;
    document.body.className = "view-" + view + " embed" +
      (document.body.classList.contains("sheet-open") ? " sheet-open" : "");
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === view);
    });
    document.title = "Fitness · " + VIEWS[view];
    if (!(opts && opts.fromHash)) syncUrl(view);

    if (view === "passes") renderPasses();
    else if (view === "events") {
      renderWeekStrip();
      renderCalendar();
    } else {
      renderFeatured();
      renderBuildingGyms();
      renderTeaser();
      renderGrid();
    }
    if (!(opts && opts.silent)) window.scrollTo(0, 0);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
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

  document.getElementById("detail-back").addEventListener("click", closeDetail);

  document.addEventListener("click", function (e) {
    var t = e.target;

    var goto = t.closest("[data-goto]");
    if (goto) {
      closeSheet();
      closeDetail();
      setView(goto.getAttribute("data-goto"));
      return;
    }

    if (t.closest("[data-sheet-close]")) {
      closeSheet();
      return;
    }

    var detailGym = t.closest("[data-detail-gym]");
    if (detailGym) {
      openDetail({ kind: "gym", id: detailGym.getAttribute("data-detail-gym") });
      return;
    }

    var detailStudio = t.closest("[data-detail-studio]");
    if (detailStudio) {
      openDetail({ kind: "studio", id: detailStudio.getAttribute("data-detail-studio") });
      return;
    }

    var detailEvent = t.closest("[data-detail-event]");
    if (detailEvent) {
      openDetail({ kind: "event", id: detailEvent.getAttribute("data-detail-event") });
      return;
    }

    // legacy data-event → detail
    var legacyEvent = t.closest("[data-event]");
    if (legacyEvent) {
      openDetail({ kind: "event", id: legacyEvent.getAttribute("data-event") });
      return;
    }

    var confirmSignupBtn = t.closest("[data-confirm-signup]");
    if (confirmSignupBtn) {
      confirmSignup(confirmSignupBtn.getAttribute("data-confirm-signup"));
      return;
    }

    var showPass = t.closest("[data-show-pass]");
    if (showPass) {
      var pass = getPass(showPass.getAttribute("data-show-pass"));
      if (pass) openPassSheet(pass);
      return;
    }

    var saveCard = t.closest("[data-save-pass-card]");
    if (saveCard) {
      var sp = rotatePassQr(saveCard.getAttribute("data-save-pass-card")) ||
        getPass(saveCard.getAttribute("data-save-pass-card"));
      if (sp) {
        renderQrCanvas(document.querySelector("#qr-wrap"), sp.code);
        setTimeout(function () { savePassCardImage(sp); }, 80);
      }
      return;
    }

    var calEvent = t.closest("[data-calendar-event]");
    if (calEvent) {
      var ce = findEvent(calEvent.getAttribute("data-calendar-event"));
      if (ce) downloadCalendarEvent(ce);
      return;
    }

    var confirmRsvp = t.closest("[data-confirm-rsvp]");
    if (confirmRsvp) {
      var eid = confirmRsvp.getAttribute("data-confirm-rsvp");
      addRsvp(eid);
      toast("RSVP confirmed — saved to My Passes");
      openDetail({ kind: "event", id: eid });
      renderDayEvents();
      renderTeaser();
      if (state.view === "passes") renderPasses();
      return;
    }

    var cancelRsvp = t.closest("[data-cancel-rsvp]");
    if (cancelRsvp) {
      var cid = cancelRsvp.getAttribute("data-cancel-rsvp");
      removeRsvp(cid);
      toast("RSVP canceled");
      openDetail({ kind: "event", id: cid });
      renderDayEvents();
      renderTeaser();
      if (state.view === "passes") renderPasses();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!sheet.hidden) closeSheet();
    else if (!detailPage.hidden) closeDetail();
  });

  document.querySelector(".tabs").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    setView(tab.getAttribute("data-tab"));
  });

  document.getElementById("cal-prev").addEventListener("click", function () {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-today").addEventListener("click", function () {
    var today = startOfDay(new Date());
    state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    state.selectedDate = today;
    renderCalendar();
    renderWeekStrip();
  });

  window.addEventListener("hashchange", function () {
    var view = location.hash.replace(/^#/, "") || "discover";
    if (view === "membership") view = "passes";
    setView(view, { fromHash: true, silent: true });
  });

  var chip = document.getElementById("building-chip");
  if (chip) chip.textContent = BUILDING.name;

  buildEvents();
  var today = startOfDay(new Date());
  state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  state.selectedDate = today;

  var initial = location.hash.replace(/^#/, "") || "discover";
  if (initial === "membership") initial = "passes";
  setView(initial, { fromHash: true, silent: true });
})();
