const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "app.js"), "utf8");
const queueKey = (type, grade = "all") => JSON.stringify({ type, grade, min: "1", max: "8" });
const card = (id, type = "kanji", level = 1) => ({
  id, type, level, characters: String.fromCodePoint(0x4e00 + id),
  primaryMeaning: `Item ${id}`, meanings: [`Item ${id}`], readings: [],
});

function createApp() {
  const storage = new Map();
  const elements = new Map();
  const listeners = {};
  const elementsFor = (id) => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: "", checked: false, textContent: "", style: {}, dataset: {},
        addEventListener() {}, setAttribute() {}, replaceChildren() {},
        querySelector() { return { style: {} }; },
        classList: {
          add: (...names) => names.forEach((name) => classes.add(name)),
          remove: (...names) => names.forEach((name) => classes.delete(name)),
          contains: (name) => classes.has(name),
        },
      });
    }
    return elements.get(id);
  };
  for (const [id, options, value] of [
    ["typeFilter", [["both", "Kanji + Vocabulary"], ["kanji", "Kanji only"], ["vocabulary", "Vocabulary only"]], "kanji"],
    ["gradeFilter", [["all", "All Grades"], ["1", "Grade 1"]], "all"],
  ]) {
    const element = elementsFor(id);
    element.options = options.map(([value, text]) => ({ value, text }));
    element.value = value;
    Object.defineProperty(element, "selectedIndex", {
      get: () => element.options.findIndex((option) => option.value === element.value),
    });
  }
  elementsFor("minLevel").value = "1";
  elementsFor("maxLevel").value = "8";
  elementsFor("noRepeat").checked = true;
  const context = vm.createContext({
    document: {
      visibilityState: "visible", getElementById: elementsFor,
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    window: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout() {}, clearTimeout() {},
    fetch: async () => { throw new Error("Unexpected network request"); },
  });
  vm.runInContext(source, context);
  const app = vm.runInContext(`({
    state, el, applyFilters, savePersistentQueue, resetCurrentQueue,
    restoreCachedDeck, loadFromApi, syncIfStale, markCorrect, formatCacheDate
  })`, context);
  return {
    ...app, storage, listeners, context,
    remaining: () => Array.from(app.state.unusedIndices, (index) => app.state.filteredDeck[index].id),
    queues: () => JSON.parse(storage.get("wk_reverse_queues")).queues,
    seedQueues(queues, deckIds) {
      storage.set("wk_reverse_queues", JSON.stringify({ deckIds, queues }));
    },
    mockApi(cards, currentLevel = 9) {
      let requests = 0;
      context.fetch = async (url) => {
        requests += 1;
        let payload;
        if (url.endsWith("/user")) payload = { data: { username: "test", level: currentLevel } };
        else if (url.includes("/assignments?")) {
          payload = { data: cards.map((item) => ({ data: { subject_id: item.id } })) };
        } else if (url.includes("/subjects?")) {
          payload = { data: cards.map((item) => ({
            id: item.id, object: item.type,
            data: {
              level: item.level, characters: item.characters,
              meanings: [{ meaning: item.primaryMeaning, primary: true, accepted_answer: true }],
            },
          })) };
        } else throw new Error(`Unexpected URL: ${url}`);
        return { ok: true, json: async () => payload };
      };
      return () => requests;
    },
  };
}

test("legacy queues retain progress across additions, removals and reorderings in every list", () => {
  const app = createApp();
  app.seedQueues({
    [queueKey("kanji")]: [2, 3],
    [queueKey("vocabulary")]: [5],
    [queueKey("kanji", "1")]: [],
  }, [1, 2, 3, 5]);
  app.state.kanjiGrades = { [card(1).characters]: 1, [card(4).characters]: 1 };
  app.state.deck = [card(4), card(2), card(1), card(6, "vocabulary")];
  app.applyFilters();
  assert.deepEqual(app.remaining(), [4, 2]);
  app.state.unusedIndices = [1];
  app.savePersistentQueue();
  app.el.typeFilter.value = "vocabulary";
  app.applyFilters();
  assert.deepEqual(app.remaining(), [6]);
  app.el.typeFilter.value = "kanji";
  app.el.gradeFilter.value = "1";
  app.applyFilters();
  assert.deepEqual(app.remaining(), [4]);
  assert.deepEqual(app.queues()[queueKey("kanji")], [2]);
});

test("an exhausted queue stays exhausted on unchanged sync; Reset List affects only that list", () => {
  const app = createApp();
  app.seedQueues({
    [queueKey("kanji")]: [], [queueKey("vocabulary")]: [3],
  }, [1, 2, 3]);
  app.state.deck = [card(2), card(1), card(3, "vocabulary")];
  app.applyFilters();
  assert.deepEqual(app.remaining(), []);
  app.resetCurrentQueue();
  assert.deepEqual(app.remaining(), [2, 1]);
  assert.deepEqual(app.queues()[queueKey("vocabulary")], [3]);
});

test("sync preserves filters, current flipped card, and correct-button indexing, including after reload", async () => {
  const app = createApp();
  app.seedQueues({ [queueKey("kanji")]: [2] }, [1, 2]);
  app.restoreCachedDeck({
    deck: [card(1), card(2, "kanji", 3)],
    savedAt: "2020-01-01T12:00:00Z", metadata: { currentLevel: 8 },
  });
  app.el.apiToken.value = "test-token";
  app.state.currentCard = app.state.filteredDeck[1];
  app.state.currentIndex = 1;
  app.el.flashcard.classList.add("is-flipped");
  app.mockApi([card(1), card(2, "kanji", 3), card(4, "kanji", 2)]);
  await app.loadFromApi();
  assert.equal(app.el.maxLevel.value, "8");
  assert.equal(app.state.currentCard.id, 2);
  assert.equal(app.state.filteredDeck[app.state.currentIndex].id, 2);
  assert.equal(app.el.flashcard.classList.contains("is-flipped"), true);
  assert.deepEqual(app.remaining(), [4, 2]);
  const beforeReview = createApp();
  for (const [key, value] of app.storage) beforeReview.storage.set(key, value);
  beforeReview.restoreCachedDeck(JSON.parse(app.storage.get("wk_reverse_cache")));
  assert.deepEqual(beforeReview.remaining(), [4, 2]);
  app.markCorrect();
  assert.deepEqual(app.remaining(), [4]);
  const reloaded = createApp();
  for (const [key, value] of app.storage) reloaded.storage.set(key, value);
  reloaded.restoreCachedDeck(JSON.parse(app.storage.get("wk_reverse_cache")));
  assert.deepEqual(reloaded.remaining(), [4]);
});

test("daily sync runs once for stale data and coalesces focus, visibility and manual requests", async () => {
  const app = createApp();
  app.el.apiToken.value = "test-token";
  const requests = app.mockApi([card(1)]);
  const pending = app.syncIfStale();
  app.listeners.focus();
  app.listeners.visibilitychange();
  await app.loadFromApi();
  await pending;
  assert.equal(requests(), 3);
  await app.syncIfStale();
  assert.equal(requests(), 3);
  app.state.lastAutoSyncDay = "";
  await app.syncIfStale();
  assert.equal(requests(), 3);
  await app.loadFromApi();
  assert.equal(requests(), 6);
  app.state.lastSyncedAt = "2020-01-01T12:00:00Z";
  app.context.document.visibilityState = "hidden";
  await app.syncIfStale();
  assert.equal(requests(), 6);
  app.context.document.visibilityState = "visible";
  await app.listeners.visibilitychange();
  assert.equal(requests(), 9);
});

test("failed automatic sync retains cache and queues and allows manual retry", async () => {
  const app = createApp();
  const cached = {
    deck: [card(1), card(2)], savedAt: "2020-01-01T12:00:00Z",
    metadata: { currentLevel: 8 },
  };
  app.storage.set("wk_reverse_cache", JSON.stringify(cached));
  app.seedQueues({ [queueKey("kanji")]: [2] }, [1, 2]);
  app.restoreCachedDeck(cached);
  app.el.apiToken.value = "test-token";
  app.context.fetch = async (url) => {
    if (url.endsWith("/user")) {
      return { ok: true, json: async () => ({ data: { username: "test", level: 10 } }) };
    }
    throw new Error("Offline");
  };
  const before = [...app.storage.entries()];
  await app.syncIfStale();
  assert.deepEqual([...app.storage.entries()], before);
  assert.deepEqual(app.remaining(), [2]);
  assert.equal(app.el.maxLevel.value, "8");
  assert.equal(app.el.status.className, "status err");
  assert.equal(app.state.syncInProgress, false);
  app.mockApi([card(1), card(2), card(3)]);
  await app.loadFromApi();
  assert.deepEqual(app.remaining(), [2, 3]);
});

test("an empty successful sync clears unavailable items and persists today's empty cache", async () => {
  const app = createApp();
  app.state.deck = [card(1)];
  app.state.cacheLabel = "2020/01/01";
  app.state.lastSyncedAt = "2020-01-01T12:00:00Z";
  app.applyFilters();
  app.state.currentCard = app.state.deck[0];
  app.state.currentIndex = 0;
  app.el.apiToken.value = "test-token";
  app.mockApi([]);
  await app.loadFromApi();
  assert.equal(app.state.currentCard, null);
  assert.deepEqual(app.remaining(), []);
  assert.deepEqual(JSON.parse(app.storage.get("wk_reverse_cache")).deck, []);
  assert.match(app.el.cacheInfo.textContent, /0\/0 remaining/);
  assert.match(app.el.promptPrimary.textContent, /No started/);
});

test("clearing the token while syncing prevents the response from replacing cached data", async () => {
  const app = createApp();
  app.state.deck = [card(1)];
  app.el.apiToken.value = "test-token";
  const requests = app.mockApi([card(2)]);
  const pending = app.loadFromApi();
  app.el.apiToken.value = "";
  await pending;
  assert.equal(requests(), 3);
  assert.deepEqual(Array.from(app.state.deck, (item) => item.id), [1]);
  assert.equal(app.storage.has("wk_reverse_cache"), false);
  assert.match(app.el.status.textContent, /token changed/);
});
