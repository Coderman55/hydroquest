const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

global.__DEV__ = false;
require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

let activeStorage;
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') {
    return { __esModule: true, default: activeStorage };
  }
  if (request === '../lib/healthKit') {
    return { writeDrinkSample: async () => null, deleteDrinkSample: async () => {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const root = path.resolve(__dirname, '..');
const profileKey = '@hydroquest/profile';
const hydrationKey = '@hydroquest/hydration';

function makeStorage(mode = 'ok', entries = {}) {
  const values = new Map(Object.entries(entries));
  const writes = [];
  return {
    writes,
    values,
    getItem(key) {
      if (mode === 'syncReject') throw new Error('synchronous read failed');
      if (mode === 'reject') return Promise.reject(new Error('read failed'));
      if (mode === 'malformed') return Promise.resolve('{not valid json');
      return Promise.resolve(values.get(key) ?? null);
    },
    async setItem(key, value) {
      writes.push([key, value]);
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    setMode(next) {
      mode = next;
    },
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function loadStores(storage) {
  activeStorage = storage;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(root) && (key.includes(`${path.sep}store${path.sep}`) || key.includes(`${path.sep}lib${path.sep}`))) {
      delete require.cache[key];
    }
  }
  const hydration = require(path.join(root, 'store/useHydrationStore.ts')).useHydrationStore;
  const profile = require(path.join(root, 'store/useProfileStore.ts')).useProfileStore;
  await settle();
  return { hydration, profile };
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('failed read and malformed JSON stay recoverable without default writes, then retry', async () => {
  for (const mode of ['syncReject', 'reject', 'malformed']) {
    const storage = makeStorage(mode, {
      [profileKey]: JSON.stringify({ state: { onboardingComplete: true, age: 31 }, version: 0 }),
      [hydrationKey]: JSON.stringify({ state: { todayIntakeOz: 19, bottleLevelOz: 13, lastOpenedDate: yesterday() }, version: 2 }),
    });
    const { hydration, profile } = await loadStores(storage);
    assert.equal(hydration.getState().persistenceStatus, 'error');
    assert.equal(profile.getState().persistenceStatus, 'error');
    assert.equal(storage.writes.length, 0, `${mode} must not overwrite unread data`);

    storage.setMode('ok');
    hydration.getState().retryHydration();
    profile.getState().retryHydration();
    await settle();
    assert.equal(hydration.getState().persistenceStatus, 'ready');
    assert.equal(profile.getState().persistenceStatus, 'ready');
    assert.equal(profile.getState().onboardingComplete, true);
    assert.equal(profile.getState().age, 31);
    assert.equal(hydration.getState().todayIntakeOz, 19);
    assert.equal(hydration.getState().bottleLevelOz, 13);
    assert.ok(storage.writes.length > 0, 'successful retry may persist recovered state');
  }
});

test('migration completes before writes open', async () => {
  const storage = makeStorage('ok', {
    [hydrationKey]: JSON.stringify({ state: { todayIntakeOz: 11, lastOpenedDate: yesterday() }, version: 0 }),
  });
  const { hydration } = await loadStores(storage);
  const state = hydration.getState();
  assert.equal(state.persistenceStatus, 'ready');
  assert.equal(state.todayIntakeOz, 11);
  assert.deepEqual(state.eventLedger, []);
  assert.equal(state.schemaVersion, '2');
  const persisted = JSON.parse(storage.values.get(hydrationKey));
  assert.equal(persisted.version, 2);
  assert.equal(persisted.state.schemaVersion, '2');
  assert.equal(persisted.state.todayIntakeOz, 11);
  assert.deepEqual(persisted.state.eventLedger, []);
});

test('mutation boundary rolls day before water, bottle, undo, and goal changes', async () => {
  const storage = makeStorage();
  const { hydration, profile } = await loadStores(storage);
  profile.setState({ weightLb: 150, age: 30, sex: 'female', activityLevel: 'low', climate: 'cool' });
  hydration.setState({
    lastOpenedDate: yesterday(), todayIntakeOz: 30, dailyGoalOz: 20,
    streakCount: 3, lastGoalHitDate: yesterday(), bottleLevelOz: 9,
    eventLedger: [{ id: 'old', timestampIsoUtc: '2026-01-01T00:00:00.000Z', date: yesterday(), type: 'refill', previousLevelOz: 1, newLevelOz: 9 }],
    lastAction: { type: 'refill', prevBottleLevelOz: 1 }, lastEventId: 'old',
  });
  hydration.getState().logWater(8);
  let state = hydration.getState();
  assert.equal(state.todayIntakeOz, 8);
  assert.equal(state.bottleLevelOz, 9);
  assert.equal(state.eventLedger.length, 2);
  assert.equal(state.streakCount, 3, 'a successful prior day keeps its existing streak');

  hydration.setState({ lastOpenedDate: yesterday(), lastAction: { type: 'refill', prevBottleLevelOz: 1 }, lastEventId: 'old' });
  hydration.getState().undoLastAction();
  state = hydration.getState();
  assert.equal(state.lastAction, null, 'cross-midnight undo is cleared before undoing');
  assert.equal(state.bottleLevelOz, 9);

  hydration.setState({ lastOpenedDate: yesterday(), todayIntakeOz: 22 });
  hydration.getState().setGoal({ recommendedGoalOz: 80, dailyGoalOz: 80 });
  state = hydration.getState();
  assert.equal(state.todayIntakeOz, 0);
  assert.equal(state.dailyGoalOz, 80);
  assert.equal(state.bottleLevelOz, 9);
  assert.equal(state.eventLedger.length, 2);

  hydration.setState({ lastOpenedDate: yesterday(), todayIntakeOz: 18 });
  hydration.getState().setBottleLevel(4);
  state = hydration.getState();
  assert.equal(state.todayIntakeOz, 0);
  assert.equal(state.bottleLevelOz, 4);
  hydration.getState().refillBottle(12);
  assert.equal(hydration.getState().bottleLevelOz, 12);
});

test('initial, missed-day, and unsuccessful prior-day rollover preserve bottle and ledger', async () => {
  const storage = makeStorage();
  const { hydration, profile } = await loadStores(storage);
  const inputs = profile.getState();
  hydration.getState().runNewDayCheck(inputs);
  assert.notEqual(hydration.getState().lastOpenedDate, null);

  hydration.setState({
    lastOpenedDate: '2020-01-01', todayIntakeOz: 40, streakCount: 4,
    bottleLevelOz: 7,
    eventLedger: [{ id: 'kept', timestampIsoUtc: '2020-01-01T00:00:00.000Z', date: '2020-01-01', type: 'refill', previousLevelOz: 2, newLevelOz: 7 }],
  });
  hydration.getState().runNewDayCheck(inputs);
  const state = hydration.getState();
  assert.equal(state.todayIntakeOz, 0);
  assert.equal(state.streakCount, 0);
  assert.equal(state.bottleLevelOz, 7);
  assert.equal(state.eventLedger.length, 1);
});
