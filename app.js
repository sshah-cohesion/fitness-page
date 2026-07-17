(function () {
  "use strict";

  var BUILDING_GYMS = window.BUILDING_GYMS || [];
  var GYMS = window.GYMS || [];
  var EVENT_TEMPLATES = window.EVENT_TEMPLATES || [];
  var STORE_KEY = "fitness_building_gyms";
  var RSVP_KEY = "fitness_event_rsvps";

  var state = {
    filter: "all",
    query: "",
    view: "discover",
    activeGym: null,
    calMonth: null,
    selectedDate: null,
    events: [],
  };

  var grid = document.getElementById("grid");
  var empty = document.getElementById("empty");
  var chipsWrap = document.getElementById("chips");
  var searchInput = document.getElementById("search");
  var modal = document.getElementById("modal");
  var eventModal = document.getElementById("event-modal");
  var toastEl = document.getElementById("toast");
  var mmList = document.getElementById("mm-list");
  var mmEmpty = document.getElementById("mm-empty");
  var toastTimer = null;
  var activeEventId = null;

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
    return a.replace(/,\s*IL\s*\d{5}$/, "").replace(/,\s*Chicago.*$/, ", Chicago");
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

  function starSvg() {
    return '<svg class="star" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z"/></svg>';
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
    return '<span class="pill ' + cls + '">' + b.label + "</span>";
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

  function getSignups() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveSignup(entry) {
    var all = getSignups();
    if (all.some(function (x) { return x.id === entry.id; })) return false;
    all.unshift(entry);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) {}
    return true;
  }
  function isSignedUp(id) {
    return getSignups().some(function (x) { return x.id === id; });
  }

  function getRsvps() {
    try { return JSON.parse(localStorage.getItem(RSVP_KEY)) || []; }
    catch (e) { return []; }
  }
  function toggleRsvp(eventId) {
    var all = getRsvps();
    var idx = all.indexOf(eventId);
    if (idx >= 0) all.splice(idx, 1);
    else all.push(eventId);
    try { localStorage.setItem(RSVP_KEY, JSON.stringify(all)); } catch (e) {}
    return all.indexOf(eventId) >= 0;
  }
  function hasRsvp(eventId) {
    return getRsvps().indexOf(eventId) >= 0;
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

  function renderBuildingGyms() {
    var wrap = document.getElementById("building-grid");
    if (!wrap) return;
    wrap.innerHTML = "";
    BUILDING_GYMS.forEach(function (gym, i) {
      var signed = isSignedUp(gym.id);
      var card = document.createElement("article");
      card.className = "building-card" + (i === 0 ? " is-featured" : "");
      card.style.animationDelay = (i * 80) + "ms";
      card.innerHTML =
        '<div class="building-media">' +
          '<img data-fallback="' + gym.fallback + '" src="' + gym.img + '" alt="' + gym.name + '" />' +
          '<span class="pill pill-free">Free signup</span>' +
        "</div>" +
        '<div class="building-body">' +
          '<div class="building-top">' +
            "<div>" +
              '<span class="building-cat">' + gym.category + "</span>" +
              "<h3>" + gym.name + "</h3>" +
            "</div>" +
            '<span class="rating">' + starSvg() + gym.rating.toFixed(1) +
              ' <span class="rev">(' + gym.reviews + ")</span></span>" +
          "</div>" +
          '<p class="building-tagline">' + gym.tagline + "</p>" +
          '<ul class="building-meta">' +
            "<li>" + gym.location + "</li>" +
            "<li>" + gym.hours + "</li>" +
          "</ul>" +
          '<div class="building-actions">' +
            (signed
              ? '<button class="btn btn-ghost" data-goto="membership">View access pass</button>'
              : '<button class="btn btn-primary" data-signup="' + gym.id + '">Sign up free</button>') +
            (signed ? '<span class="signed-chip">Signed up</span>' : "") +
          "</div>" +
        "</div>";
      wrap.appendChild(card);
      wireFallback(card.querySelector("img"));
    });
  }

  function renderTeaser() {
    var list = document.getElementById("teaser-list");
    if (!list) return;
    var today = startOfDay(new Date());
    var upcoming = state.events
      .filter(function (e) { return e.date >= today; })
      .slice(0, 4);
    list.innerHTML = "";
    upcoming.forEach(function (ev, i) {
      var el = document.createElement("button");
      el.className = "teaser-card";
      el.style.animationDelay = (i * 60) + "ms";
      el.setAttribute("data-event", ev.id);
      el.innerHTML =
        '<div class="teaser-date">' +
          '<span class="teaser-dow">' + ev.date.toLocaleDateString("en-US", { weekday: "short" }) + "</span>" +
          '<span class="teaser-day">' + ev.date.getDate() + "</span>" +
        "</div>" +
        '<div class="teaser-info">' +
          '<span class="type-pill type-' + ev.type + '">' + (TYPE_LABELS[ev.type] || ev.type) + "</span>" +
          "<strong>" + ev.title + "</strong>" +
          '<span class="teaser-meta">' + ev.time + " · " + ev.place + "</span>" +
        "</div>";
      list.appendChild(el);
    });
  }

  function renderGrid() {
    var list = GYMS.filter(matches);
    if (state.view === "discover") list = list.slice(0, 4);
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
            '<span class="card-blurb">' + gym.tagline + "</span>" +
            '<a class="btn btn-ghost" href="' + mapUrl(gym.address) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Directions</a>' +
          "</div>" +
        "</div>";
      grid.appendChild(card);
      wireFallback(card.querySelector("img"));
    });
  }

  function renderMemberships() {
    var all = getSignups();
    mmEmpty.hidden = all.length !== 0;
    mmList.innerHTML = "";
    all.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "mm-card";
      el.innerHTML =
        '<img class="mm-thumb" data-fallback="' + m.fallback + '" src="' + m.img + '" alt="' + m.name + '" />' +
        '<div class="mm-info">' +
          "<h4>" + m.name + "</h4>" +
          '<div class="mm-tier">Free resident access</div>' +
          '<div class="mm-meta">' + m.location + " · Joined " + m.date + "</div>" +
          '<span class="mm-status">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Active</span>' +
        "</div>";
      mmList.appendChild(el);
      wireFallback(el.querySelector("img"));
    });
  }

  // ---------- Calendar ----------
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
      btn.className = "cal-day";
      btn.type = "button";
      btn.setAttribute("role", "gridcell");
      if (!inMonth) btn.classList.add("is-outside");
      if (sameDay(day, today)) btn.classList.add("is-today");
      if (sameDay(day, state.selectedDate)) btn.classList.add("is-selected");
      if (dayEvents.length) btn.classList.add("has-events");

      var dots = dayEvents.slice(0, 3).map(function (e) {
        return '<span class="cal-dot type-' + e.type + '"></span>';
      }).join("");

      btn.innerHTML =
        '<span class="cal-num">' + day.getDate() + "</span>" +
        (dots ? '<span class="cal-dots">' + dots + "</span>" : "");

      (function (d) {
        btn.addEventListener("click", function () {
          state.selectedDate = d;
          if (d.getMonth() !== state.calMonth.getMonth()) {
            state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
            renderCalendar();
          } else {
            Array.prototype.forEach.call(calGrid.querySelectorAll(".cal-day"), function (el) {
              el.classList.remove("is-selected");
            });
            btn.classList.add("is-selected");
            renderDayEvents();
          }
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

    items.forEach(function (ev, i) {
      var el = document.createElement("button");
      el.className = "event-row";
      el.style.animationDelay = (i * 50) + "ms";
      el.setAttribute("data-event", ev.id);
      el.innerHTML =
        '<span class="event-rail type-' + ev.type + '"></span>' +
        '<div class="event-row-body">' +
          '<div class="event-row-top">' +
            "<strong>" + ev.title + "</strong>" +
            (hasRsvp(ev.id) ? '<span class="rsvp-chip">Going</span>' : "") +
          "</div>" +
          '<span class="event-row-meta">' + ev.time + "</span>" +
          '<span class="event-row-meta">' + ev.place + " · " + ev.spots + " spots</span>" +
        "</div>";
      list.appendChild(el);
    });
  }

  // ---------- Views ----------
  var VIEW_LABELS = {
    discover: "Discover",
    events: "Events",
    studios: "Studios",
    membership: "My Gyms",
  };

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

    if (!(opts && opts.fromHash) && location.hash.replace(/^#/, "") !== view) {
      location.hash = view;
    }

    if (view === "membership") renderMemberships();
    else if (view === "events") renderCalendar();
    else {
      renderBuildingGyms();
      renderTeaser();
      renderGrid();
    }

    if (!(opts && opts.silent)) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Signup modal ----------
  function openSignup(gym) {
    state.activeGym = gym;
    document.getElementById("m-title").textContent = gym.name;
    document.getElementById("m-sub").textContent = gym.location + " · " + gym.hours;
    document.getElementById("m-tagline").textContent = gym.tagline;

    var img = document.getElementById("m-img");
    img.setAttribute("data-fallback", gym.fallback);
    img.style.display = "";
    img.parentElement.style.background = "";
    img.src = gym.img;
    img.alt = gym.name;
    wireFallback(img);

    var perks = document.getElementById("m-perks");
    perks.innerHTML = (gym.perks || []).map(function (p) {
      return "<li>" +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        p + "</li>";
    }).join("");

    document.getElementById("m-signup").hidden = false;
    document.getElementById("m-success").hidden = true;
    var confirmBtn = document.getElementById("m-confirm");
    if (isSignedUp(gym.id)) {
      confirmBtn.textContent = "Already signed up";
      confirmBtn.disabled = true;
    } else {
      confirmBtn.textContent = "Sign up free";
      confirmBtn.disabled = false;
    }

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function confirmSignup() {
    var gym = state.activeGym;
    if (!gym || isSignedUp(gym.id)) return;
    saveSignup({
      id: gym.id,
      name: gym.name,
      location: gym.location,
      img: gym.img,
      fallback: gym.fallback,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    document.getElementById("m-signup").hidden = true;
    document.getElementById("m-success-text").textContent =
      "Your free access to " + gym.name + " is ready. Find your pass in My Gyms.";
    document.getElementById("m-success").hidden = false;
    renderBuildingGyms();
    toast("Signed up — free resident access unlocked");
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function findEvent(id) {
    return state.events.find(function (e) { return e.id === id; });
  }

  function openEvent(id) {
    var ev = findEvent(id);
    if (!ev) return;
    activeEventId = id;
    document.getElementById("e-title").textContent = ev.title;
    document.getElementById("e-desc").textContent = ev.description;
    document.getElementById("e-when").textContent = formatLongDate(ev.date) + " · " + ev.time;
    document.getElementById("e-where").textContent = ev.place;
    document.getElementById("e-spots").textContent = ev.spots + " resident spots";
    var typeEl = document.getElementById("e-type");
    typeEl.className = "type-pill type-" + ev.type;
    typeEl.textContent = TYPE_LABELS[ev.type] || ev.type;
    var rsvpBtn = document.getElementById("e-rsvp");
    rsvpBtn.textContent = hasRsvp(id) ? "Cancel RSVP" : "RSVP free";
    rsvpBtn.classList.toggle("btn-ghost", hasRsvp(id));
    rsvpBtn.classList.toggle("btn-primary", !hasRsvp(id));
    eventModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEventModal() {
    eventModal.hidden = true;
    if (modal.hidden) document.body.style.overflow = "";
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
    var signup = e.target.closest("[data-signup]");
    if (signup) {
      var gym = BUILDING_GYMS.find(function (g) {
        return g.id === signup.getAttribute("data-signup");
      });
      if (gym) openSignup(gym);
      return;
    }

    var eventBtn = e.target.closest("[data-event]");
    if (eventBtn) {
      openEvent(eventBtn.getAttribute("data-event"));
      return;
    }

    var goto = e.target.closest("[data-goto]");
    if (goto) {
      setView(goto.getAttribute("data-goto"));
      return;
    }

    if (e.target.closest("[data-close]")) closeModal();
    if (e.target.closest("[data-close-event]")) closeEventModal();
  });

  document.getElementById("m-confirm").addEventListener("click", confirmSignup);

  document.getElementById("e-rsvp").addEventListener("click", function () {
    if (!activeEventId) return;
    var going = toggleRsvp(activeEventId);
    document.getElementById("e-rsvp").textContent = going ? "Cancel RSVP" : "RSVP free";
    document.getElementById("e-rsvp").classList.toggle("btn-ghost", going);
    document.getElementById("e-rsvp").classList.toggle("btn-primary", !going);
    renderDayEvents();
    renderTeaser();
    toast(going ? "You're going — see you there" : "RSVP canceled");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!eventModal.hidden) closeEventModal();
    else if (!modal.hidden) closeModal();
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
  });

  window.addEventListener("hashchange", function () {
    setView(location.hash.replace(/^#/, "") || "discover", { fromHash: true });
  });

  // Boot
  buildEvents();
  var today = startOfDay(new Date());
  state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  state.selectedDate = today;
  setView(location.hash.replace(/^#/, "") || "discover", { fromHash: true, silent: true });
})();
