/* =========================================================
   IRON DISTRICT — Site configuration and editable settings
   ========================================================= */
const SITE_CONFIG = {
  // Replace with the gym's WhatsApp number in international digits only.
  // Example format: "923001234567" (no +, spaces, or dashes).
  whatsappNumber: "923152136621",
  timezone: "Asia/Karachi"
};

/* =========================================================
   Shared helpers
   ========================================================= */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

const whatsappURL = (text) =>
  `https://wa.me/${SITE_CONFIG.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

/* =========================================================
   Motion setup: GSAP is optional. If the CDN is blocked or the visitor
   prefers reduced motion, every section simply shows without animation.
   ========================================================= */
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasGSAP = typeof window.gsap !== "undefined";
const canAnimate = hasGSAP && !prefersReducedMotion;
const hasScrollTrigger = canAnimate && typeof window.ScrollTrigger !== "undefined";
if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if (!canAnimate) document.documentElement.classList.add("anim-off");

/** Reveal a group of elements. `onScroll` waits until the trigger enters the viewport. */
function revealGroup(elements, { trigger, onScroll = true, y = 28, stagger = 0.09 } = {}) {
  const targets = [...elements];
  if (!canAnimate || !targets.length) return;
  const vars = {
    y, opacity: 0, duration: 0.7, ease: "power3.out", stagger,
    // Clear inline transforms afterwards so CSS hover effects keep working.
    clearProps: "transform,opacity"
  };
  if (onScroll && hasScrollTrigger) {
    vars.scrollTrigger = { trigger: trigger || targets[0], start: "top 88%", once: true };
  }
  gsap.from(targets, vars);
}

/* =========================================================
   Gym opening status (Mon–Sat, 7:00 AM to 4:00 AM the next day)
   ========================================================= */
function getGymStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SITE_CONFIG.timezone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23"
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday").value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const minutes = (Number(parts.find((p) => p.type === "hour").value) % 24) * 60 +
    Number(parts.find((p) => p.type === "minute").value);

  const openDaytime = day >= 1 && day <= 6 && minutes >= 7 * 60;
  // Early-morning hours belong to the previous day's session (Mon–Sat), so Monday 12–4 AM is closed.
  const openAfterMidnight = minutes < 4 * 60 && day !== 1;

  if (openDaytime || openAfterMidnight) return { open: true, text: "Open now · until 4:00 AM" };
  if (day === 0) return { open: false, text: "Closed today · opens Monday 7:00 AM" };
  return { open: false, text: "Closed now · opens 7:00 AM" };
}

function updateStatusBadges() {
  const status = getGymStatus();
  [["#hours-status", "#hours-status-text", status.text], ["#wa-status", "#wa-status-text",
    status.open ? "Online · replies quickly" : "Away · we reply when we open"]].forEach(([wrap, label, text]) => {
      const wrapper = $(wrap);
      const textEl = $(label);
      if (!wrapper || !textEl) return;
      wrapper.dataset.state = status.open ? "open" : "closed";
      textEl.textContent = text;
    });
}

/* =========================================================
   Programs: load JSON, render cards, search and category filter
   ========================================================= */
const programGrid = $("#program-grid");
const programSearch = $("#program-search");
const programStatus = $("#program-status");
const filterButtons = $$("[data-filter]");
let allPrograms = [];
let activeProgramFilter = "All";
let programsRevealed = false;

/** Card image is a real <img>, so it always matches its card, even after filtering. */
const cardImage = (file, alt, extraClass = "") => `
  <div class="card-image ${extraClass}">
    <img src="images/${escapeHTML(file)}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async" width="640" height="480">
  </div>`;

function renderPrograms() {
  const query = programSearch.value.trim().toLowerCase();
  const filteredPrograms = allPrograms.filter((program) => {
    const matchesCategory = activeProgramFilter === "All" || program.category === activeProgramFilter;
    const searchableText = `${program.title} ${program.category} ${program.description} ${program.tag}`.toLowerCase();
    return matchesCategory && searchableText.includes(query);
  });

  if (programStatus) {
    programStatus.textContent = filteredPrograms.length
      ? `${filteredPrograms.length} program${filteredPrograms.length === 1 ? "" : "s"} shown`
      : "No programs match your search";
  }

  if (!filteredPrograms.length) {
    programGrid.innerHTML = '<p class="empty-message">No programs match that search. Try another term or category.</p>';
    return;
  }

  programGrid.innerHTML = filteredPrograms.map((program) => `
    <article class="content-card program-card">
      ${cardImage(program.image, program.imageAlt)}
      <div class="card-body">
        <span class="card-tag">${escapeHTML(program.tag)}</span>
        <h3>${escapeHTML(program.title)}</h3>
        <p>${escapeHTML(program.description)}</p>
        <button class="card-link program-details-button" type="button" data-program-id="${escapeHTML(program.id)}">View program details <span aria-hidden="true">↗</span></button>
        <a class="card-link" href="#contact" data-interest="${escapeHTML(program.title)}">${escapeHTML(program.cta)} <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  `).join("");

  // First render waits for the grid to scroll into view; later renders (filtering) animate straight away.
  revealGroup($$(".program-card", programGrid), { trigger: programGrid, onScroll: !programsRevealed, y: 22, stagger: 0.07 });
  programsRevealed = true;
}

async function initPrograms() {
  try {
    allPrograms = await loadJSON("assets/data/programs.json");
    renderPrograms();
  } catch (error) {
    console.error(error);
    programGrid.innerHTML = '<p class="empty-message">Programs could not load. Run this website through a local development server rather than opening the HTML file directly.</p>';
  }
}

programSearch.addEventListener("input", renderPrograms);
filterButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
  button.addEventListener("click", () => {
    activeProgramFilter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    renderPrograms();
  });
});

/* =========================================================
   Trainers: populate profile cards from JSON
   ========================================================= */
async function initTrainers() {
  const grid = $("#trainer-grid");
  try {
    const trainers = await loadJSON("assets/data/trainers.json");
    grid.innerHTML = trainers.map((trainer) => `
      <article class="content-card trainer-card">
        ${cardImage(trainer.image, trainer.imageAlt)}
        <div class="card-body">
          <span class="card-tag">${escapeHTML(trainer.specialty)}</span>
          <h3>${escapeHTML(trainer.name)}</h3>
          <p>${escapeHTML(trainer.bio)}</p>
          <div class="trainer-meta"><span>${escapeHTML(trainer.experience)}</span></div>
        </div>
      </article>
    `).join("");
    revealGroup($$(".trainer-card", grid), { trigger: grid });
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<p class="empty-message">Trainer profiles could not load. Please run this site with a local server.</p>';
  }
}

/* =========================================================
   Memberships: render comparison cards from JSON data
   ========================================================= */
async function initMemberships() {
  const grid = $("#membership-grid");
  try {
    const plans = await loadJSON("assets/data/memberships.json");
    grid.innerHTML = plans.map((plan) => `
      <article class="content-card membership-card ${plan.featured ? "is-featured" : ""}">
        <span class="plan-label">${escapeHTML(plan.label)}</span>
        <h3>${escapeHTML(plan.name)}</h3>
        <p class="plan-price">${escapeHTML(plan.price)}<small> ${escapeHTML(plan.period)}</small></p>
        <p class="plan-description">${escapeHTML(plan.description)}</p>
        <ul class="plan-features">${plan.features.map((feature) => `<li>${escapeHTML(feature)}</li>`).join("")}</ul>
        <a class="button ${plan.featured ? "button-primary" : "button-ghost"}" href="#contact" data-interest="${escapeHTML(plan.name + " membership")}">${escapeHTML(plan.cta)} <span aria-hidden="true">↗</span></a>
      </article>
    `).join("");
    revealGroup($$(".membership-card", grid), { trigger: grid });
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<p class="empty-message">Membership plans could not load. Please run this site with a local server.</p>';
  }
}

/* =========================================================
   Reviews: render cards from JSON, arrow controls and progress bar
   ========================================================= */
async function initReviews() {
  const track = $("#review-track");
  if (!track) return;
  const prev = $("#review-prev");
  const next = $("#review-next");
  const bar = $("#review-progress-bar");

  try {
    const reviews = await loadJSON("assets/data/testimonials.json");
    track.innerHTML = reviews.map((review) => `
      <article class="content-card review-card">
        <div class="review-top">
          <i class="fa-solid fa-quote-left review-quote-icon" aria-hidden="true"></i>
          <div class="stars" role="img" aria-label="${escapeHTML(review.rating)} out of 5 stars">${Array.from({ length: 5 },
      (_, index) => `<i class="fa-solid fa-star${index < review.rating ? "" : " is-off"}"></i>`).join("")}</div>
        </div>
        <blockquote><p>${escapeHTML(review.quote)}</p></blockquote>
        <footer class="review-author">
          <span class="review-avatar" aria-hidden="true">${escapeHTML(review.initials)}</span>
          <div><strong>${escapeHTML(review.name)}</strong><span>${escapeHTML(review.program)} · ${escapeHTML(review.since)}</span></div>
        </footer>
      </article>
    `).join("");
    revealGroup($$(".review-card", track), { trigger: track, y: 30, stagger: 0.08 });
  } catch (error) {
    console.error(error);
    track.innerHTML = '<p class="empty-message">Reviews could not load. Please run this site with a local server.</p>';
    return;
  }

  const updateControls = () => {
    const max = track.scrollWidth - track.clientWidth;
    const ratio = max > 0 ? track.scrollLeft / max : 1;
    if (bar) bar.style.transform = `scaleX(${Math.max(0.12, Math.min(1, 0.12 + ratio * 0.88)).toFixed(3)})`;
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft >= max - 4;
  };
  const scrollByCard = (direction) => {
    const card = $(".review-card", track);
    if (!card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 18;
    track.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: prefersReducedMotion ? "auto" : "smooth" });
  };
  prev.addEventListener("click", () => scrollByCard(-1));
  next.addEventListener("click", () => scrollByCard(1));
  track.addEventListener("scroll", updateControls, { passive: true });
  window.addEventListener("resize", updateControls);
  updateControls();
}

/* =========================================================
   Theme-matched interest dropdown (wraps the native select).
   syncInterestUI() keeps it in step with the native select whenever
   the value is changed by code, e.g. from a card button.
   ========================================================= */
const interestSelect = $("#interest");
let syncInterestUI = () => { };
let interestTrigger = null;
let interestWrapper = null;

if (interestSelect) {
  interestWrapper = document.createElement("div");
  interestWrapper.className = "select-enhanced";
  interestSelect.parentNode.insertBefore(interestWrapper, interestSelect);
  interestWrapper.appendChild(interestSelect);
  interestSelect.classList.add("select-native");
  // The native select stays in the form for its value, but is hidden from keyboards and screen readers
  // because the custom control replaces it. Validation is handled in the submit handler below.
  interestSelect.tabIndex = -1;
  interestSelect.setAttribute("aria-hidden", "true");

  interestTrigger = document.createElement("button");
  interestTrigger.type = "button";
  interestTrigger.className = "select-trigger";
  interestTrigger.setAttribute("aria-haspopup", "listbox");
  interestTrigger.setAttribute("aria-expanded", "false");
  interestTrigger.setAttribute("aria-labelledby", "interest-label");
  interestTrigger.setAttribute("aria-describedby", "interest-error");
  const triggerText = document.createElement("span");
  const chevron = document.createElement("span");
  chevron.className = "select-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
  interestTrigger.append(triggerText, chevron);

  const optionsPanel = document.createElement("div");
  optionsPanel.className = "select-options";
  optionsPanel.setAttribute("role", "listbox");
  optionsPanel.setAttribute("aria-labelledby", "interest-label");

  const optionButtons = [...interestSelect.options].map((option, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "select-option";
    item.setAttribute("role", "option");
    item.textContent = option.textContent;
    item.disabled = option.disabled;
    item.addEventListener("click", () => {
      interestSelect.selectedIndex = index;
      syncInterestUI();
      clearFieldError("interest");
      closeInterestOptions();
      interestTrigger.focus();
    });
    optionsPanel.appendChild(item);
    return item;
  });

  syncInterestUI = () => {
    const selected = interestSelect.selectedOptions[0];
    const hasValue = Boolean(interestSelect.value);
    triggerText.textContent = selected?.textContent || "Choose an option";
    triggerText.classList.toggle("is-placeholder", !hasValue);
    optionButtons.forEach((item, index) => item.setAttribute("aria-selected", String(index === interestSelect.selectedIndex)));
  };

  const closeInterestOptions = () => {
    interestWrapper.classList.remove("is-open");
    interestTrigger.setAttribute("aria-expanded", "false");
  };
  const openInterestOptions = () => {
    interestWrapper.classList.add("is-open");
    interestTrigger.setAttribute("aria-expanded", "true");
    (optionButtons.find((item) => item.getAttribute("aria-selected") === "true" && !item.disabled) ||
      optionButtons.find((item) => !item.disabled))?.focus();
  };
  const moveOptionFocus = (direction) => {
    const enabled = optionButtons.filter((item) => !item.disabled);
    const index = enabled.indexOf(document.activeElement);
    enabled[(index + direction + enabled.length) % enabled.length]?.focus();
  };

  interestTrigger.addEventListener("click", () => {
    interestWrapper.classList.contains("is-open") ? closeInterestOptions() : openInterestOptions();
  });
  interestTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openInterestOptions(); }
  });
  optionsPanel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); moveOptionFocus(1); }
    if (event.key === "ArrowUp") { event.preventDefault(); moveOptionFocus(-1); }
    if (event.key === "Home") { event.preventDefault(); optionButtons.find((item) => !item.disabled)?.focus(); }
    if (event.key === "End") { event.preventDefault();[...optionButtons].reverse().find((item) => !item.disabled)?.focus(); }
    if (event.key === "Tab") closeInterestOptions();
  });
  document.addEventListener("click", (event) => { if (!interestWrapper.contains(event.target)) closeInterestOptions(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && interestWrapper.classList.contains("is-open")) {
      closeInterestOptions();
      interestTrigger.focus();
    }
  });
  interestSelect.addEventListener("change", syncInterestUI);
  interestWrapper.append(interestTrigger, optionsPanel);
  syncInterestUI();
}

/** Preselect the interest from card buttons. Works with the custom dropdown. */
function setInterest(requested) {
  if (!interestSelect || !requested) return;
  const normalized = requested.toLowerCase();
  const option = [...interestSelect.options].find((item) =>
    item.value.toLowerCase() === normalized || item.value.toLowerCase() === `${normalized} membership`);
  if (!option) return;
  interestSelect.value = option.value;
  syncInterestUI();
  clearFieldError("interest");
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-interest]");
  if (link) setInterest(link.dataset.interest);
});

/* =========================================================
   Mobile navigation: toggle menu and close after navigation
   ========================================================= */
const menuToggle = $(".menu-toggle");
const primaryNav = $("#primary-nav");

function setMenuOpen(isOpen) {
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  primaryNav.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("menu-open", isOpen);
}

menuToggle.addEventListener("click", () => {
  setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
});
window.addEventListener("resize", () => { if (window.innerWidth > 760) setMenuOpen(false); });
$$("a", primaryNav).forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

/* =========================================================
   Header polish: shadow after scrolling and active section link
   ========================================================= */
const siteHeader = $(".site-header");
const syncHeader = () => siteHeader.classList.toggle("is-scrolled", window.scrollY > 12);
window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

if ("IntersectionObserver" in window) {
  const navLinks = $$('.primary-nav > a[href^="#"]:not(.button)');
  const sections = navLinks.map((link) => $(link.getAttribute("href"))).filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        const current = link.getAttribute("href") === `#${entry.target.id}`;
        link.classList.toggle("is-current", current);
        if (current) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((section) => spy.observe(section));
}

/* =========================================================
   Membership inquiry form: validate every field, then open WhatsApp
   ========================================================= */
const inquiryForm = $("#inquiry-form");
const formStatus = $("#form-status");
const nameField = $("#full-name");
const messageField = $("#message");
const charCount = $("#char-count");
const submitButton = $("[type=submit]", inquiryForm);
const submitDefaultHTML = submitButton.innerHTML;

// Each rule returns an error message, or an empty string when the field is fine.
const fieldRules = {
  name: {
    control: () => nameField,
    anchor: () => nameField,
    check: () => nameField.value.trim().length >= 2 ? "" : "Please enter your name (at least 2 characters)."
  },
  interest: {
    control: () => interestTrigger || interestSelect,
    anchor: () => interestWrapper || interestSelect,
    check: () => interestSelect.value ? "" : "Choose a membership or program so we know where to start."
  }
};

function clearFieldError(key) {
  const rule = fieldRules[key];
  if (!rule) return;
  $(`#${key}-error`)?.remove();
  rule.control()?.removeAttribute("aria-invalid");
}

function showFieldError(key, message) {
  const rule = fieldRules[key];
  clearFieldError(key);
  const error = document.createElement("p");
  error.className = "field-error";
  error.id = `${key}-error`;
  error.textContent = message;
  rule.control().setAttribute("aria-invalid", "true");
  rule.anchor().insertAdjacentElement("afterend", error);
  if (canAnimate) gsap.from(error, { y: -6, opacity: 0, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity" });
}

nameField.addEventListener("input", () => clearFieldError("name"));
nameField.addEventListener("blur", () => {
  if (nameField.value.trim() && fieldRules.name.check()) showFieldError("name", fieldRules.name.check());
});

if (messageField && charCount) {
  const updateCount = () => { charCount.textContent = `${messageField.value.length} / ${messageField.maxLength}`; };
  messageField.addEventListener("input", updateCount);
  updateCount();
}

function setSendingState(isSending) {
  submitButton.disabled = isSending;
  submitButton.setAttribute("aria-busy", String(isSending));
  submitButton.innerHTML = isSending
    ? '<b class="btn-text"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Opening WhatsApp…</b>'
    : submitDefaultHTML;
}

inquiryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formStatus.className = "form-status";
  formStatus.textContent = "";

  // Check all fields so the visitor sees every problem at once, then focus the first one.
  const failed = Object.keys(fieldRules).filter((key) => {
    const message = fieldRules[key].check();
    if (message) showFieldError(key, message); else clearFieldError(key);
    return Boolean(message);
  });
  if (failed.length) {
    fieldRules[failed[0]].control().focus();
    return;
  }

  const visitTime = new FormData(inquiryForm).get("visitTime");
  const message = [
    "Hello Iron District! I'd like to enquire about joining your gym.",
    "",
    `Name: ${nameField.value.trim()}`,
    `Interested in: ${interestSelect.value}`,
    visitTime ? `Best time to visit: ${visitTime}` : null,
    `Message: ${messageField.value.trim() || "No additional details"}`,
    "",
    "Please share the next steps. Thank you!"
  ].filter((line) => line !== null).join("\n");
  const url = whatsappURL(message);

  setSendingState(true);
  // Opened inside the click handler so popup blockers allow it; falls back to this tab if blocked.
  const chat = window.open(url, "_blank");
  if (!chat) { window.location.href = url; return; }
  chat.opener = null;

  formStatus.className = "form-status is-success";
  formStatus.textContent = "WhatsApp opened with your message ready to send. ";
  const retry = document.createElement("a");
  retry.href = url;
  retry.target = "_blank";
  retry.rel = "noopener";
  retry.textContent = "Didn't open? Tap here.";
  formStatus.appendChild(retry);

  window.setTimeout(() => {
    setSendingState(false);
    inquiryForm.reset();
    syncInterestUI();
    if (charCount) charCount.textContent = `0 / ${messageField.maxLength}`;
  }, 1200);
});

/* =========================================================
   Dynamic program details dialog
   ========================================================= */
const programDialog = $("#program-dialog");
$(".dialog-close").addEventListener("click", () => programDialog.close());
programDialog.addEventListener("click", (event) => { if (event.target === programDialog) programDialog.close(); });
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-program-id]");
  if (!button) return;
  const program = allPrograms.find((item) => item.id === button.dataset.programId);
  if (!program) return;
  $("#program-dialog-title").textContent = program.title;
  $("#program-dialog-description").textContent = program.details || program.description;
  $("#program-dialog-focus").textContent = program.focus || program.category;
  $("#program-dialog-best-for").textContent = program.bestFor || "All fitness levels";
  $("#program-dialog-approach").textContent = program.approach || program.tag;
  $("#program-dialog-cta").dataset.interest = program.title;
  programDialog.showModal();
  document.body.classList.add("dialog-open");
});
// Close the dialog when its call-to-action is used, so the page can scroll to the form.
$("#program-dialog-cta").addEventListener("click", () => {
  programDialog.close();
  document.body.classList.remove("dialog-open");
});
programDialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
programDialog.addEventListener("cancel", () => document.body.classList.remove("dialog-open"));

/* =========================================================
   WhatsApp chat widget
   ========================================================= */
const waWidget = $("#wa-widget");
if (waWidget) {
  const fab = $("#wa-fab");
  const panel = $("#wa-panel");
  const closeButton = $("#wa-close");
  const tip = $("#wa-tip");

  // Every WhatsApp link on the page carries its message in data-wa.
  $$("[data-wa]").forEach((link) => {
    link.href = whatsappURL(link.dataset.wa);
    link.target = "_blank";
    link.rel = "noopener";
  });

  const setPanelOpen = (isOpen) => {
    waWidget.classList.toggle("is-open", isOpen);
    fab.setAttribute("aria-expanded", String(isOpen));
    panel.setAttribute("aria-hidden", String(!isOpen));
    tip.classList.remove("is-visible");
    // Wait a beat so the panel is visible before it receives focus.
    if (isOpen) window.setTimeout(() => $(".wa-quick a", panel)?.focus(), 80);
  };
  fab.addEventListener("click", () => setPanelOpen(!waWidget.classList.contains("is-open")));
  closeButton.addEventListener("click", () => { setPanelOpen(false); fab.focus(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && waWidget.classList.contains("is-open")) { setPanelOpen(false); fab.focus(); }
  });
  document.addEventListener("click", (event) => {
    if (waWidget.classList.contains("is-open") && !waWidget.contains(event.target)) setPanelOpen(false);
  });
  $$("a", panel).forEach((link) => link.addEventListener("click", () => setPanelOpen(false)));

  // A single gentle nudge per visit, never while the panel is open.
  let tipSeen = false;
  try { tipSeen = sessionStorage.getItem("id-wa-tip") === "1"; } catch (error) { /* storage unavailable */ }
  if (!tipSeen) {
    window.setTimeout(() => {
      if (waWidget.classList.contains("is-open")) return;
      tip.classList.add("is-visible");
      try { sessionStorage.setItem("id-wa-tip", "1"); } catch (error) { /* storage unavailable */ }
      window.setTimeout(() => tip.classList.remove("is-visible"), 6500);
    }, 7000);
  }
}

/* =========================================================
   Scroll progress, hero entrance, counters and section reveals (GSAP)
   ========================================================= */
// Plain-JS progress bar used whenever ScrollTrigger is not driving it.
function initProgressFallback() {
  const bar = $(".scroll-progress");
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0})`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function countUp(element) {
  const end = Number(element.dataset.count);
  if (Number.isNaN(end)) return;
  const decimals = Number(element.dataset.decimals || 0);
  const pad = Number(element.dataset.pad || 0);
  const suffix = element.dataset.suffix || "";
  const counter = { value: 0 };
  gsap.to(counter, {
    value: end, duration: 1.6, ease: "power2.out",
    onUpdate: () => { element.textContent = counter.value.toFixed(decimals).padStart(pad, "0") + suffix; },
    onComplete: () => { element.textContent = end.toFixed(decimals).padStart(pad, "0") + suffix; }
  });
}

function initMotion() {
  if (!hasScrollTrigger) initProgressFallback();
  if (!canAnimate) return;

  // Hero: one orchestrated entrance (the memorable moment), then a slow parallax on scroll.
  const hero = $(".hero");
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.set("#hero-title", { opacity: 1 }, 0)
    .fromTo(".hero-image", { scale: 1.3 }, { scale: 1.12, duration: 2.2, ease: "power2.out" }, 0)
    .fromTo(".hero .eyebrow", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, clearProps: "transform" }, 0.1)
    .fromTo(".hero h1 .h-in", { yPercent: 110 }, { yPercent: 0, duration: 0.95, stagger: 0.12, clearProps: "transform" }, 0.25)
    .fromTo(".hero-copy, .hero-actions", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, clearProps: "transform" }, 0.85)
    .fromTo(".hero-stats > div", { opacity: 0, y: 16 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.1, clearProps: "transform",
      onStart: () => $$(".hero-stats [data-count]").forEach(countUp)
    }, 1.1)
    .fromTo(".hero-side-note", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.4);

  if (!hasScrollTrigger) return;

  gsap.to(".hero-image", {
    yPercent: 5, ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
  });
  gsap.to(".scroll-progress", {
    scaleX: 1, ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.3 }
  });

  // Section headings and static blocks fade up once as they enter view.
  [
    ".section-heading-row",
    ".about-grid > *",
    ".value-card",
    ".facility-grid figure",
    ".testimonial-layout > *",
    ".faq-intro",
    ".faq-item",
    ".contact-copy",
    ".inquiry-form"
  ].forEach((selector) => {
    $$(selector).forEach((element) => revealGroup([element], { trigger: element, y: 24 }));
  });

  // Rating counter on the reviews heading.
  const score = $(".review-score");
  if (score) ScrollTrigger.create({ trigger: score, start: "top 90%", once: true, onEnter: () => countUp(score) });
}

// FAQ: ease the answer open (closing stays instant, which keeps keyboard use snappy).
$$(".faq-item").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open || !canAnimate) return;
    gsap.fromTo($(".faq-body", item), { height: 0, opacity: 0 }, {
      height: "auto", opacity: 1, duration: 0.35, ease: "power2.out", clearProps: "height,opacity"
    });
  });
});

/* =========================================================
   Initialize data-driven sections, footer year and motion
   ========================================================= */
$("#current-year").textContent = new Date().getFullYear();
updateStatusBadges();
window.setInterval(updateStatusBadges, 60000);
initMotion();

Promise.all([initPrograms(), initTrainers(), initMemberships(), initReviews()]).then(() => {
  // Content added after load changes the page height, so recalculate scroll positions once.
  if (hasScrollTrigger) ScrollTrigger.refresh();
});
