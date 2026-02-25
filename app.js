// ==============================
// SafeConnect Working Prototype
// Creator: Murunwa Mutshotsho
// ==============================

const LS_KEY = "safeconnect_items_v1";
const LS_THEME = "safeconnect_theme_v1";

const statusBox = document.getElementById("statusBox");
const statusSub = document.getElementById("statusSub");

const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const accEl = document.getElementById("acc");

const openInMapsBtn = document.getElementById("openInMapsBtn");
const copyCoordsBtn = document.getElementById("copyCoordsBtn");

const panicBtn = document.getElementById("panicBtn");
const getLocationBtn = document.getElementById("getLocationBtn");
const shareAppBtn = document.getElementById("shareAppBtn");
const centerMeBtn = document.getElementById("centerMeBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const reportForm = document.getElementById("reportForm");
const incidentTypeEl = document.getElementById("incidentType");
const incidentDescEl = document.getElementById("incidentDesc");
const incidentImageEl = document.getElementById("incidentImage");
const fillDemoBtn = document.getElementById("fillDemoBtn");

const feedEl = document.getElementById("feed");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");

const toggleThemeBtn = document.getElementById("toggleThemeBtn");
document.getElementById("year").textContent = new Date().getFullYear();

let myPosition = null; // {lat, lng, acc}
let map, myMarker;
let markers = new Map(); // id -> leaflet marker

// ---------- Helpers ----------
function nowISO() {
  return new Date().toISOString();
}

function niceTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function setStatus(main, sub = "") {
  statusBox.firstElementChild.innerHTML = `<strong>Status:</strong> ${main}`;
  statusSub.textContent = sub || "";
}

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function addItem(item) {
  const items = loadItems();
  items.unshift(item); // newest first
  saveItems(items);
  renderAll();
}

function clearAll() {
  localStorage.removeItem(LS_KEY);
  renderAll();
}

function uuid() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function coordsToMapsLink(lat, lng) {
  // Works on most devices
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

function ensureGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported on this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy)
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Map ----------
function initMap() {
  map = L.map("map").setView([-26.2041, 28.0473], 12); // Default: Johannesburg
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // If user allows location, center
  updateMyMarkerOnMap();
}

function updateMyMarkerOnMap() {
  if (!map) return;

  if (myPosition) {
    const { lat, lng } = myPosition;
    if (!myMarker) {
      myMarker = L.marker([lat, lng]).addTo(map).bindPopup("You are here");
    } else {
      myMarker.setLatLng([lat, lng]);
    }
  }
}

function upsertIncidentMarker(item) {
  if (!map) return;
  if (!item.location) return;

  const { lat, lng } = item.location;
  const label = item.kind === "PANIC" ? "🚨 Panic Alert" : "📝 Report";
  const title = `${label}: ${item.type || "Incident"}`;

  const popupHtml = `
    <div style="font-weight:900;margin-bottom:6px;">${escapeHtml(title)}</div>
    <div style="font-size:12px;opacity:.8;margin-bottom:6px;">${escapeHtml(niceTime(item.createdAt))}</div>
    <div style="font-size:13px;line-height:1.4;opacity:.9;">${escapeHtml(item.description || "")}</div>
    <div style="margin-top:8px;">
      <a href="${coordsToMapsLink(lat, lng)}" target="_blank" rel="noopener">Open in Maps</a>
    </div>
  `;

  if (markers.has(item.id)) {
    markers.get(item.id).setLatLng([lat, lng]).bindPopup(popupHtml);
  } else {
    const m = L.marker([lat, lng]).addTo(map).bindPopup(popupHtml);
    markers.set(item.id, m);
  }
}

function rebuildMarkers() {
  // Remove old markers
  markers.forEach((m) => map.removeLayer(m));
  markers.clear();

  const items = loadItems();
  for (const item of items) {
    upsertIncidentMarker(item);
  }
}

// ---------- Render ----------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = `${item.kind} ${item.type || ""} ${item.description || ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesFilter(item, f) {
  if (f === "ALL") return true;
  return item.kind === f;
}

function renderFeed() {
  const items = loadItems();
  const q = searchInput.value.trim();
  const f = filterSelect.value;

  const filtered = items.filter(it => matchesSearch(it, q) && matchesFilter(it, f));

  if (filtered.length === 0) {
    feedEl.innerHTML = `<div class="muted">No items yet. Press PANIC or submit a report.</div>`;
    return;
  }

  feedEl.innerHTML = filtered.map(item => {
    const tagClass = item.kind === "PANIC" ? "panic" : "report";
    const tagText = item.kind === "PANIC" ? "PANIC ALERT" : "REPORT";
    const locText = item.location ? `${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)} (±${item.location.acc}m)` : "No location";
    const mapsLink = item.location ? coordsToMapsLink(item.location.lat, item.location.lng) : "#";

    return `
      <div class="feed-item">
        <div class="feed-head">
          <div class="feed-title">
            <span class="tag ${tagClass}">${tagText}</span>
            ${escapeHtml(item.type || (item.kind === "PANIC" ? "Emergency" : "Incident"))}
          </div>
          <div class="feed-meta">${escapeHtml(niceTime(item.createdAt))}</div>
        </div>

        <div class="feed-body">
          <div><strong>Details:</strong> ${escapeHtml(item.description || "")}</div>
          <div class="tiny muted" style="margin-top:6px;"><strong>Location:</strong> ${escapeHtml(locText)}</div>
        </div>

        ${item.imageDataUrl ? `<img class="thumb" src="${item.imageDataUrl}" alt="Uploaded evidence image" />` : ""}

        <div class="feed-actions">
          <a class="btn small" href="${mapsLink}" target="_blank" rel="noopener">🗺️ Open in Maps</a>
          <button class="btn small ghost" data-copy="${escapeHtml(locText)}" type="button">📋 Copy Location</button>
          <button class="btn small ghost" data-delete="${escapeHtml(item.id)}" type="button">🗑️ Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Buttons
  feedEl.querySelectorAll("button[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.getAttribute("data-copy") || "");
        setStatus("Copied ✅", "Location copied to clipboard.");
      } catch {
        setStatus("Copy failed", "Your browser blocked clipboard access.");
      }
    });
  });

  feedEl.querySelectorAll("button[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete");
      const items = loadItems().filter(it => it.id !== id);
      saveItems(items);
      renderAll();
      setStatus("Deleted", "Item removed from the local database.");
    });
  });
}

function renderLocationBox() {
  if (!myPosition) {
    latEl.textContent = "—";
    lngEl.textContent = "—";
    accEl.textContent = "—";
    openInMapsBtn.href = "#";
    openInMapsBtn.setAttribute("aria-disabled", "true");
    return;
  }
  latEl.textContent = myPosition.lat.toFixed(6);
  lngEl.textContent = myPosition.lng.toFixed(6);
  accEl.textContent = `±${myPosition.acc}m`;

  openInMapsBtn.href = coordsToMapsLink(myPosition.lat, myPosition.lng);
  openInMapsBtn.removeAttribute("aria-disabled");
}

function renderAll() {
  renderLocationBox();
  renderFeed();
  if (map) {
    rebuildMarkers();
    updateMyMarkerOnMap();
  }
}

// ---------- Actions ----------
async function refreshLocation() {
  try {
    setStatus("Getting your location…", "Please allow location permission.");
    myPosition = await ensureGeolocation();
    setStatus("Location updated ✅", "Your current coordinates are shown and used for reports.");
    renderAll();
  } catch (err) {
    setStatus("Location failed", "Tip: Use Chrome and enable location permission.");
  }
}

panicBtn.addEventListener("click", async () => {
  // Panic button creates a PANIC item, attempts GPS, then shares
  let loc = null;
  try {
    setStatus("Panic pressed 🚨", "Getting your live location…");
    loc = await ensureGeolocation();
    myPosition = loc; // update current location too
  } catch {
    setStatus("Panic pressed 🚨", "Location permission not granted. Alert will be saved without GPS.");
  }

  const panicItem = {
    id: uuid(),
    kind: "PANIC",
    type: "Emergency Panic",
    description: "Emergency alert sent. Please respond or contact emergency services.",
    location: loc,
    createdAt: nowISO(),
    imageDataUrl: null
  };

  addItem(panicItem);

  // “Send to nearby users” needs backend. For school demo we use share link/text.
  const shareText = loc
    ? `🚨 SAFEConnect PANIC ALERT!\nLocation: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} (±${loc.acc}m)\nOpen: ${coordsToMapsLink(loc.lat, loc.lng)}`
    : `🚨 SAFEConnect PANIC ALERT!\nLocation not available.\nOpen the app to see details.`;

  // Try native share first
  try {
    if (navigator.share) {
      await navigator.share({
        title: "SafeConnect Panic Alert",
        text: shareText
      });
      setStatus("Panic alert created + shared ✅", "Shared via your phone share menu.");
    } else {
      await navigator.clipboard.writeText(shareText);
      setStatus("Panic alert created ✅", "Share text copied to clipboard (paste to WhatsApp/SMS).");
    }
  } catch {
    // If share cancelled or blocked
    setStatus("Panic alert created ✅", "Open the feed/map to view it.");
  }
});

getLocationBtn.addEventListener("click", refreshLocation);

shareAppBtn.addEventListener("click", async () => {
  const shareText = "SafeConnect (School Prototype): Safety alerts + incident map + reports.\nOpen this page on your device to test.";
  try {
    if (navigator.share) {
      await navigator.share({ title: "SafeConnect", text: shareText, url: location.href });
      setStatus("Shared ✅", "Link shared successfully.");
    } else {
      await navigator.clipboard.writeText(location.href);
      setStatus("Copied ✅", "Link copied to clipboard.");
    }
  } catch {
    setStatus("Share cancelled", "");
  }
});

centerMeBtn.addEventListener("click", async () => {
  if (!map) return;
  if (!myPosition) {
    await refreshLocation();
  }
  if (myPosition) {
    map.setView([myPosition.lat, myPosition.lng], 16);
    if (myMarker) myMarker.openPopup();
  }
});

clearAllBtn.addEventListener("click", () => {
  const ok = confirm("Clear all saved reports and alerts? (This only clears this browser/device)");
  if (!ok) return;
  clearAll();
  setStatus("Cleared ✅", "Local database cleared.");
});

copyCoordsBtn.addEventListener("click", async () => {
  if (!myPosition) return;
  const txt = `${myPosition.lat.toFixed(6)}, ${myPosition.lng.toFixed(6)} (±${myPosition.acc}m)`;
  try {
    await navigator.clipboard.writeText(txt);
    setStatus("Copied ✅", "Your coordinates were copied.");
  } catch {
    setStatus("Copy failed", "Clipboard blocked by browser.");
  }
});

fillDemoBtn.addEventListener("click", () => {
  incidentTypeEl.value = "Suspicious Activity";
  incidentDescEl.value = "Unknown person walking around checking gates (demo report).";
  setStatus("Demo filled ✨", "You can now submit to see it on the map.");
});

reportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Get location (recommended)
  let loc = null;
  try {
    if (!myPosition) myPosition = await ensureGeolocation();
    loc = myPosition;
  } catch {
    // allow report without location
  }

  const file = incidentImageEl.files?.[0] || null;
  const dataUrl = await fileToDataURL(file);

  const reportItem = {
    id: uuid(),
    kind: "REPORT",
    type: incidentTypeEl.value,
    description: incidentDescEl.value.trim(),
    location: loc,
    createdAt: nowISO(),
    imageDataUrl: dataUrl
  };

  addItem(reportItem);
  reportForm.reset();
  setStatus("Report submitted ✅", "It’s saved and pinned on the map.");
});

// Search / filter
searchInput.addEventListener("input", renderFeed);
filterSelect.addEventListener("change", renderFeed);

// Theme
function loadTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved === "light") document.body.classList.add("light");
}
function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem(LS_THEME, document.body.classList.contains("light") ? "light" : "dark");
}
toggleThemeBtn.addEventListener("click", toggleTheme);
loadTheme();

// Boot
initMap();
renderAll();

// Also show open-in-maps for current location when ready
openInMapsBtn.addEventListener("click", (e) => {
  if (!myPosition) {
    e.preventDefault();
    setStatus("No location yet", "Tap “Get My Location” first.");
  }
});
