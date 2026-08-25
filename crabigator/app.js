const API_BASE = "https://api.wanikani.com/v2";
const API_REVISION = "20170710";

const STORAGE_TOKEN_KEY = "wk_reverse_token";
const STORAGE_CACHE_KEY = "wk_reverse_cache";
const STORAGE_QUEUE_KEY = "wk_reverse_queues";
const KANJIVG_BASE_URL = "https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji";

const kanjiSvgCache = new Map();

const state = {
  deck: [],
  filteredDeck: [],
  unusedIndices: [],
  currentCard: null,
  cacheLabel: "",
};

const el = {
  apiToken: document.getElementById("apiToken"),
  saveTokenBtn: document.getElementById("saveTokenBtn"),
  clearTokenBtn: document.getElementById("clearTokenBtn"),
  typeFilter: document.getElementById("typeFilter"),
  minLevel: document.getElementById("minLevel"),
  maxLevel: document.getElementById("maxLevel"),
  noRepeat: document.getElementById("noRepeat"),
  useCacheBtn: document.getElementById("useCacheBtn"),
  newCardBtn: document.getElementById("newCardBtn"),
  status: document.getElementById("status"),
  flashcard: document.getElementById("flashcard"),
  setupToggle: document.getElementById("setupToggle"),
  setupBody: document.getElementById("setupBody"),
  infoBtn: document.getElementById("infoBtn"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  cardTypeTag: document.getElementById("cardTypeTag"),
  cacheInfo: document.getElementById("cacheInfo"),
  deckCount: document.getElementById("deckCount"),
  promptPrimary: document.getElementById("promptPrimary"),
  promptAlternatives: document.getElementById("promptAlternatives"),
  answerCharacters: document.getElementById("answerCharacters"),
  strokeOrder: document.getElementById("strokeOrder"),
  answerReadings: document.getElementById("answerReadings"),
  answerMeanings: document.getElementById("answerMeanings"),
  answerAltMeanings: document.getElementById("answerAltMeanings"),
  answerLevel: document.getElementById("answerLevel"),
  answerDocLink: document.getElementById("answerDocLink"),
};

let _statusTimer;

function setStatus(message, tone = "") {
  el.status.textContent = message;
  el.status.className = `status ${tone}`.trim();
  el.status.style.opacity = "1";
  clearTimeout(_statusTimer);
  if (message) _statusTimer = setTimeout(() => { el.status.style.opacity = "0"; }, 4000);
}

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Wanikani-Revision": API_REVISION,
  };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const details = await safeErrorJson(response);
    throw new Error(`${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`);
  }
  return response.json();
}

async function safeErrorJson(response) {
  try {
    const payload = await response.json();
    return payload.error || "";
  } catch {
    return "";
  }
}

async function fetchAllPages(initialUrl, headers) {
  const all = [];
  let nextUrl = initialUrl;

  while (nextUrl) {
    const page = await fetchJson(nextUrl, headers);
    all.push(...page.data);
    nextUrl = page.pages?.next_url || null;
  }

  return all;
}

function extractPrimaryMeaning(subject) {
  const primary = (subject.data.meanings || []).find((m) => m.primary);
  return primary ? primary.meaning : (subject.data.slug || "");
}

function extractMeanings(subject) {
  const accepted = (subject.data.meanings || [])
    .filter((m) => m.accepted_answer)
    .map((m) => m.meaning);

  return accepted.length > 0 ? accepted : [subject.data.slug || "(unknown meaning)"];
}

function extractReadings(subject) {
  return (subject.data.readings || [])
    .filter((r) => r.accepted_answer)
    .map((r) => r.reading);
}

function extractReadingsByType(subject, type) {
  return (subject.data.readings || [])
    .filter((r) => r.type === type)
    .map((r) => r.reading);
}

function mapSubjectToCard(subject) {
  return {
    id: subject.id,
    type: subject.object,
    level: subject.data.level,
    characters: subject.data.characters || subject.data.slug,
    primaryMeaning: extractPrimaryMeaning(subject),
    meanings: extractMeanings(subject),
    readings: extractReadings(subject),
    onyomiReadings: extractReadingsByType(subject, "onyomi"),
    kunyomiReadings: extractReadingsByType(subject, "kunyomi"),
    documentUrl: subject.data.document_url || null,
  };
}

function buildUnusedIndices(length) {
  const indices = [];
  for (let i = 0; i < length; i += 1) {
    indices.push(i);
  }
  return indices;
}

function normalizeLevelRange() {
  let min = Number.parseInt(el.minLevel.value, 10);
  let max = Number.parseInt(el.maxLevel.value, 10);

  if (Number.isNaN(min)) min = 1;
  if (Number.isNaN(max)) max = 60;

  min = Math.max(1, Math.min(60, min));
  max = Math.max(1, Math.min(60, max));

  if (min > max) {
    [min, max] = [max, min];
  }

  el.minLevel.value = String(min);
  el.maxLevel.value = String(max);

  return { min, max };
}

function applyFilters() {
  const typeFilter = el.typeFilter.value;
  const { min, max } = normalizeLevelRange();

  state.filteredDeck = state.deck.filter((card) => {
    const typeMatch = typeFilter === "both" ? true : card.type === typeFilter;
    const levelMatch = card.level >= min && card.level <= max;
    return typeMatch && levelMatch;
  });

  if (el.noRepeat.checked) {
    state.unusedIndices = restorePersistentQueue() || buildUnusedIndices(state.filteredDeck.length);
  }

  updateDeckCount();
  el.newCardBtn.disabled = state.filteredDeck.length === 0;
}

function updateDeckCount() {
  el.deckCount.textContent = state.currentCard ? "" : "Grab your pen and paper!";
  if (!el.cacheInfo || state.deck.length === 0) return;
  const total = state.filteredDeck.length;
  const typeLabel = el.typeFilter.options[el.typeFilter.selectedIndex].text;
  const parts = [typeLabel, `Levels ${el.minLevel.value}-${el.maxLevel.value}`, `${total} items`];
  if (el.noRepeat.checked) parts.push(`${state.unusedIndices.length} remaining`);
  if (state.cacheLabel) parts.push(`Loaded ${state.cacheLabel}`);
  el.cacheInfo.textContent = "Current list: " + parts.join(" \u00b7 ");
  // expand container silently to fit newly added text
  if (el.setupBody.dataset.collapsed !== "true") {
    el.setupBody.style.transition = "none";
    el.setupBody.style.maxHeight = el.setupBody.scrollHeight + "px";
  }
}

function clearCardView(message) {
  state.currentCard = null;
  clearStrokeOrder();
  el.promptPrimary.textContent = message ?? (state.deck.length === 0 ? "Reload your deck to start." : "Pick Next Card to begin.");
  el.promptAlternatives.textContent = "";
  el.flashcard.classList.remove("is-flipped", "kanji", "vocabulary");
  el.cardTypeTag.classList.add("hidden");
  el.cardTypeTag.classList.remove("kanji", "vocabulary");
}

function pickNextCard() {
  if (state.filteredDeck.length === 0) {
    clearCardView("No items match your filters.");
    return;
  }

  let idx;
  if (el.noRepeat.checked) {
    if (state.unusedIndices.length === 0) {
      state.unusedIndices = buildUnusedIndices(state.filteredDeck.length);
    }
    const randomPos = Math.floor(Math.random() * state.unusedIndices.length);
    idx = state.unusedIndices.splice(randomPos, 1)[0];
    savePersistentQueue();
  } else {
    idx = Math.floor(Math.random() * state.filteredDeck.length);
  }

  const card = state.filteredDeck[idx];

  state.currentCard = card;
  clearStrokeOrder();

  el.promptPrimary.textContent = card.primaryMeaning;
  const alts = card.meanings.filter((m) => m !== card.primaryMeaning);
  el.promptAlternatives.textContent = alts.length > 0 ? `(${alts.join(", ")})` : "";
  el.flashcard.classList.remove("is-flipped", "kanji", "vocabulary");
  el.flashcard.classList.add(card.type);

  el.cardTypeTag.textContent = card.type;
  el.cardTypeTag.classList.remove("hidden", "kanji", "vocabulary");
  el.cardTypeTag.classList.add(card.type);

  updateDeckCount();
}

function getQueueFilterKey() {
  return JSON.stringify({
    type: el.typeFilter.value,
    min: el.minLevel.value,
    max: el.maxLevel.value,
  });
}

function getDeckIds() {
  return state.deck.map((card) => card.id);
}

function loadPersistentQueues() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY));
    if (!saved || !Array.isArray(saved.deckIds) || !saved.queues || typeof saved.queues !== "object") {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

function savePersistentQueue() {
  if (state.filteredDeck.length === 0) return;

  const saved = loadPersistentQueues();
  const queues = saved && JSON.stringify(saved.deckIds) === JSON.stringify(getDeckIds())
    ? saved.queues
    : {};
  queues[getQueueFilterKey()] = state.unusedIndices.map((index) => state.filteredDeck[index].id);
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify({ deckIds: getDeckIds(), queues }));
}

function restorePersistentQueue() {
  const saved = loadPersistentQueues();
  if (!saved || JSON.stringify(saved.deckIds) !== JSON.stringify(getDeckIds())) return null;

  const unusedIds = saved.queues[getQueueFilterKey()];
  if (!Array.isArray(unusedIds)) return null;

  const unusedIdSet = new Set(unusedIds);
  return state.filteredDeck
    .map((card, index) => (unusedIdSet.has(card.id) ? index : -1))
    .filter((index) => index !== -1);
}

function resetCurrentQueue() {
  if (state.filteredDeck.length === 0) {
    setStatus("There is no current list to reset.", "warn");
    return;
  }

  state.unusedIndices = buildUnusedIndices(state.filteredDeck.length);
  savePersistentQueue();
  clearCardView();
  updateDeckCount();
  setStatus("Current list reset.", "ok");
}

function clearStrokeOrder() {
  el.strokeOrder.replaceChildren();
  el.strokeOrder.hidden = true;
  delete el.strokeOrder.dataset.character;
}

function getKanjiVgFilename(character) {
  return `${character.codePointAt(0).toString(16).padStart(5, "0")}.svg`;
}

async function fetchKanjiSvg(character) {
  if (!kanjiSvgCache.has(character)) {
    const request = fetch(`${KANJIVG_BASE_URL}/${getKanjiVgFilename(character)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`KanjiVG returned ${response.status}`);
        return response.text();
      })
      .catch((error) => {
        kanjiSvgCache.delete(character);
        throw error;
      });
    kanjiSvgCache.set(character, request);
  }

  return kanjiSvgCache.get(character);
}

function animateStrokePaths(paths) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const strokeDuration = 400;
  const holdDuration = 1400;
  const totalDuration = paths.length * strokeDuration + holdDuration;

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    const start = (index * strokeDuration) / totalDuration;
    const end = ((index + 1) * strokeDuration) / totalDuration;
    const keyframes = [];

    if (start > 0) {
      keyframes.push(
        { strokeDashoffset: length, opacity: 0, offset: 0 },
        { strokeDashoffset: length, opacity: 0, offset: Math.max(0, start - 0.001) },
      );
    }
    keyframes.push(
      { strokeDashoffset: length, opacity: 1, offset: start },
      { strokeDashoffset: 0, opacity: 1, offset: end },
      { strokeDashoffset: 0, opacity: 1, offset: 0.92 },
      { strokeDashoffset: length, opacity: 0, offset: 1 },
    );

    path.style.strokeDasharray = String(length);
    path.animate(keyframes, {
      duration: totalDuration,
      iterations: Infinity,
      easing: "linear",
    });
  });
}

function buildStrokeOrderSvg(character, source) {
  const documentSvg = new DOMParser().parseFromString(source, "image/svg+xml");
  const sourcePaths = [...documentSvg.querySelectorAll("path")].filter((path) => path.getAttribute("d"));
  if (sourcePaths.length === 0) return null;

  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 109 109");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${character} stroke order, animated`);

  const guide = document.createElementNS(namespace, "path");
  guide.setAttribute("class", "stroke-guide");
  guide.setAttribute("d", "M4 54.5H105 M54.5 4V105 M4 4H105V105H4Z");
  svg.append(guide);

  const paths = sourcePaths.map((sourcePath) => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("class", "stroke-path");
    path.setAttribute("d", sourcePath.getAttribute("d"));
    svg.append(path);
    return path;
  });

  return { svg, paths };
}

async function renderStrokeOrder(characters) {
  const kanjiCharacters = [...characters].filter((character) => /\p{Script=Han}/u.test(character));
  if (kanjiCharacters.length === 0) {
    clearStrokeOrder();
    return;
  }

  el.strokeOrder.dataset.character = characters;
  const sources = await Promise.allSettled(kanjiCharacters.map(fetchKanjiSvg));
  if (el.strokeOrder.dataset.character !== characters) return;

  const diagrams = sources.flatMap((result, index) => {
    if (result.status === "rejected") return [];
    const diagram = buildStrokeOrderSvg(kanjiCharacters[index], result.value);
    return diagram ? [diagram] : [];
  });

  if (diagrams.length === 0) {
    clearStrokeOrder();
    return;
  }

  el.strokeOrder.style.setProperty("--stroke-count", diagrams.length);
  el.strokeOrder.replaceChildren(...diagrams.map((diagram) => diagram.svg));
  el.strokeOrder.hidden = false;
  animateStrokePaths(diagrams.flatMap((diagram) => diagram.paths));
}

function revealCard() {
  if (!state.currentCard) return;

  const card = state.currentCard;
  el.flashcard.classList.remove("kanji", "vocabulary");
  el.flashcard.classList.add(card.type);

  el.answerCharacters.textContent = card.characters;
  if (el.strokeOrder.dataset.character !== card.characters) renderStrokeOrder(card.characters);

  if (card.type === "kanji") {
    const lines = [];
    if (card.onyomiReadings.length > 0) lines.push(`On: ${card.onyomiReadings.join(" ・ ")}`);
    if (card.kunyomiReadings.length > 0) lines.push(`Kun: ${card.kunyomiReadings.join(" ・ ")}`);
    el.answerReadings.innerHTML = lines.join("<br>") || "\u2014";
  } else {
    el.answerReadings.textContent = card.readings.length > 0 ? card.readings.join(" ・ ") : "—";
  }

  el.answerMeanings.textContent = card.primaryMeaning;
  const altMeanings = card.meanings.filter((m) => m !== card.primaryMeaning);
  el.answerAltMeanings.textContent = altMeanings.length > 0 ? `(${altMeanings.join(", ")})` : "";
  el.answerLevel.textContent = `Level ${card.level}`;

  if (card.documentUrl) {
    el.answerDocLink.href = card.documentUrl;
    el.answerDocLink.classList.remove("hidden");
  } else {
    el.answerDocLink.classList.add("hidden");
  }

  el.flashcard.classList.toggle("is-flipped");
}

function saveToken() {
  const token = el.apiToken.value.trim();
  if (!token) {
    setStatus("Please enter a token before saving.", "warn");
    return;
  }

  localStorage.setItem(STORAGE_TOKEN_KEY, token);
  setStatus("Token saved locally in your browser.", "ok");
}

function clearToken() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  el.apiToken.value = "";
  setStatus("Token removed from local storage.", "ok");
}

function loadTokenIntoInput() {
  const saved = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (saved) {
    el.apiToken.value = saved;
  } else {
    setStatus("API token missing — open Setup to add one.", "err");
  }
}

function saveDeckCache(deck, metadata) {
  const payload = {
    savedAt: new Date().toISOString(),
    metadata,
    deck,
  };
  localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(payload));
}

function loadDeckCache() {
  const raw = localStorage.getItem(STORAGE_CACHE_KEY);
  if (!raw) {
    throw new Error("No cache found yet. Load from API once first.");
  }

  const payload = JSON.parse(raw);
  if (!Array.isArray(payload.deck)) {
    throw new Error("Cache format is invalid.");
  }

  return payload;
}

async function loadFromApi() {
  const token = el.apiToken.value.trim();
  if (!token) {
    setStatus("Please set your API token first.", "warn");
    return;
  }

  setStatus("Loading user profile...");

  try {
    const headers = getHeaders(token);
    const user = await fetchJson(`${API_BASE}/user`, headers);
    const currentLevel = user.data.level;
    el.maxLevel.value = String(currentLevel);
    el.maxLevel.setAttribute("max", currentLevel);

    setStatus("Loading started assignments (kanji + vocabulary)...");
    const assignments = await fetchAllPages(
      `${API_BASE}/assignments?started=true&subject_types=kanji,vocabulary&hidden=false`,
      headers,
    );

    const startedIds = new Set(assignments.map((a) => a.data.subject_id));
    if (startedIds.size === 0) {
      state.deck = [];
      applyFilters();
      clearCardView("No started kanji/vocabulary found.");
      setStatus("Loaded 0 started items.", "warn");
      return;
    }

    setStatus("Loading subjects and building deck...");
    const subjects = await fetchAllPages(`${API_BASE}/subjects?types=kanji,vocabulary&hidden=false`, headers);

    const deck = subjects
      .filter((subject) => startedIds.has(subject.id))
      .map(mapSubjectToCard)
      .sort((a, b) => a.level - b.level || a.id - b.id);

    state.deck = deck;
    state.cacheLabel = new Date().toLocaleString();
    applyFilters();
    clearCardView();

    saveDeckCache(deck, {
      username: user.data.username,
      currentLevel,
    });

    setStatus(
      `Loaded ${deck.length} started items for ${user.data.username} (level ${currentLevel}).`,
      "ok",
    );
  } catch (error) {
    setStatus(`Failed to load from API: ${error.message}`, "err");
  }
}

function restoreCachedDeck(cached) {
  state.deck = cached.deck;
  state.cacheLabel = new Date(cached.savedAt).toLocaleString();
  if (cached.metadata?.currentLevel) {
    el.maxLevel.value = String(cached.metadata.currentLevel);
    el.maxLevel.setAttribute("max", cached.metadata.currentLevel);
  }
  applyFilters();
  clearCardView();
}

function useCachedDeck() {
  try {
    restoreCachedDeck(loadDeckCache());
  } catch (error) {
    setStatus(`${error.message}`, "warn");
  }
}

function attachEvents() {
  el.saveTokenBtn.addEventListener("click", saveToken);
  el.clearTokenBtn.addEventListener("click", clearToken);
  el.useCacheBtn.addEventListener("click", resetCurrentQueue);
  el.newCardBtn.addEventListener("click", pickNextCard);
  document.getElementById("reloadApiBtn").addEventListener("click", loadFromApi);
  el.flashcard.addEventListener("click", revealCard);
  el.flashcard.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    pickNextCard();
  });
  el.flashcard.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      revealCard();
    }
  });

  el.setupToggle.addEventListener("click", () => {
    const isCollapsed = el.setupBody.dataset.collapsed !== "false";
    if (isCollapsed) {
      el.setupBody.dataset.collapsed = "false";
      el.setupBody.style.transition = "max-height 0.35s ease, opacity 0.25s ease";
      el.setupBody.style.maxHeight = el.setupBody.scrollHeight + "px";
      el.setupBody.style.opacity = "1";
      el.setupBody.previousElementSibling.style.marginBottom = "";
    } else {
      el.setupBody.dataset.collapsed = "true";
      el.setupBody.style.transition = "none";
      void el.setupBody.offsetHeight; // flush styles before instant hide
      el.setupBody.style.maxHeight = "0";
      el.setupBody.style.opacity = "0";
      el.setupBody.previousElementSibling.style.marginBottom = "0";
    }
    document.getElementById("eyeIcon").innerHTML = isCollapsed
      ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  });

  el.infoBtn.addEventListener("click", () => { el.modalOverlay.style.display = "flex"; });
  el.modalClose.addEventListener("click", () => { el.modalOverlay.style.display = "none"; });
  el.modalOverlay.addEventListener("click", (e) => {
    if (e.target === el.modalOverlay) el.modalOverlay.style.display = "none";
  });

  for (const id of ["typeFilter", "minLevel", "maxLevel", "noRepeat"]) {
    document.getElementById(id).addEventListener("change", () => { applyFilters(); clearCardView(); });
  }

  document.addEventListener("keydown", (event) => {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.code === "Escape") { el.modalOverlay.style.display = "none"; return; }
    if (event.code === "Space") { event.preventDefault(); revealCard(); }
    if (event.key.toLowerCase() === "n") { event.preventDefault(); pickNextCard(); }
  });
}

function init() {
  attachEvents();
  loadTokenIntoInput();
  try {
    restoreCachedDeck(loadDeckCache());
  } catch {
    applyFilters();
    clearCardView();
    el.cacheInfo.textContent = "No list loaded yet \u2014 click Reload Deck to start.";
  }
}

init();
