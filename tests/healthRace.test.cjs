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
let health;
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') return activeStorage;
  if (request === '../lib/healthKit') return health;
  return originalLoad.call(this, request, parent, isMain);
};

const root = path.resolve(__dirname, '..');

function makeStorage() {
  return {
    async getItem() { return null; },
    async setItem() {},
    async removeItem() {},
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function loadStores() {
  activeStorage = makeStorage();
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(root) && (key.includes(`${path.sep}store${path.sep}`) || key.includes(`${path.sep}lib${path.sep}`))) {
      delete require.cache[key];
    }
  }
  const hydration = require(path.join(root, 'store/useHydrationStore.ts')).useHydrationStore;
  const profile = require(path.join(root, 'store/useProfileStore.ts')).useProfileStore;
  await settle();
  // The race suite is about post-commit Health completion, not persistence;
  // force both mutation gates open after the real stores have initialized.
  hydration.setState({ persistenceStatus: 'ready', hasHydrated: true });
  profile.setState({ persistenceStatus: 'ready', hasHydrated: true, healthKitEnabled: true });
  return { hydration, profile };
}

function makeHealth() {
  const writes = [];
  const deletes = [];
  return {
    writes,
    deletes,
    writeDrinkSample(amountOz, timestamp) {
      const pending = deferred();
      writes.push({ amountOz, timestamp, pending });
      return pending.promise;
    },
    deleteDrinkSample(uuid) {
      deletes.push(uuid);
      return Promise.resolve();
    },
  };
}

function drinkByAmount(store, amountOz) {
  return store.getState().eventLedger.find((event) => event.type === 'drink' && event.volumeOz === amountOz);
}

test('attaches a completed UUID to its original drink even after a later action', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  hydration.getState().logWater(12);
  const first = drinkByAmount(hydration, 8);
  const second = drinkByAmount(hydration, 12);
  assert.notEqual(hydration.getState().lastEventId, first.id);

  health.writes[0].pending.resolve('first-uuid');
  await settle();

  assert.equal(drinkByAmount(hydration, 8).hkSampleUuid, 'first-uuid');
  assert.equal(drinkByAmount(hydration, 12).hkSampleUuid, undefined);
  assert.equal(second.id, hydration.getState().lastEventId);
});

test('out-of-order write completions attach each UUID to the matching event', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  hydration.getState().logWater(12);

  health.writes[1].pending.resolve('second-uuid');
  await settle();
  health.writes[0].pending.resolve('first-uuid');
  await settle();

  assert.equal(drinkByAmount(hydration, 8).hkSampleUuid, 'first-uuid');
  assert.equal(drinkByAmount(hydration, 12).hkSampleUuid, 'second-uuid');
});

test('undoing a pending drink deletes the UUID returned after its event was removed', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  hydration.getState().undoLastAction();
  assert.equal(hydration.getState().eventLedger.length, 0);

  health.writes[0].pending.resolve('undone-uuid');
  await settle();
  assert.deepEqual(health.deletes, ['undone-uuid']);
});

test('resetting while a write is pending deletes the returned UUID only for the invalidated event', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  hydration.getState().resetHydration();

  health.writes[0].pending.resolve('reset-uuid');
  await settle();
  assert.deepEqual(health.deletes, ['reset-uuid']);
});

test('undoing an already attached sample preserves existing delete behavior', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  health.writes[0].pending.resolve('attached-uuid');
  await settle();

  hydration.getState().undoLastAction();
  await settle();
  assert.deepEqual(health.deletes, ['attached-uuid']);
});

test('day rollover retains pending events so an older drink still receives its UUID', async () => {
  health = makeHealth();
  const { hydration, profile } = await loadStores();
  hydration.getState().logWater(8);
  const event = drinkByAmount(hydration, 8);
  hydration.setState({ lastOpenedDate: '2020-01-01' });
  hydration.getState().runNewDayCheck(profile.getState());
  assert.ok(hydration.getState().eventLedger.some((entry) => entry.id === event.id));

  health.writes[0].pending.resolve('old-uuid');
  await settle();
  assert.equal(hydration.getState().eventLedger.find((entry) => entry.id === event.id).hkSampleUuid, 'old-uuid');
  assert.deepEqual(health.deletes, []);
});

test('write and cleanup rejections are contained', async () => {
  health = makeHealth();
  health.deleteDrinkSample = (uuid) => {
    health.deletes.push(uuid);
    return Promise.reject(new Error('delete failed'));
  };
  const { hydration } = await loadStores();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    hydration.getState().logWater(8);
    health.writes[0].pending.reject(new Error('write failed'));
    await settle();

    hydration.getState().logWater(12);
    health.writes[1].pending.resolve('delete-reject-uuid');
    await settle();
    hydration.getState().undoLastAction();
    await settle();

    assert.deepEqual(health.deletes, ['delete-reject-uuid']);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('a reentrant subscriber undo during UUID attachment compensates the returned sample', async () => {
  health = makeHealth();
  const { hydration } = await loadStores();
  hydration.getState().logWater(8);
  let undone = false;
  const unsubscribe = hydration.subscribe((state) => {
    const event = state.eventLedger[0];
    if (!undone && event?.type === 'drink' && event.hkSampleUuid === 'reentrant-uuid') {
      undone = true;
      hydration.getState().undoLastAction();
    }
  });
  try {
    health.writes[0].pending.resolve('reentrant-uuid');
    await settle();
  } finally {
    unsubscribe();
  }

  assert.equal(undone, true);
  assert.equal(hydration.getState().eventLedger.length, 0);
  assert.deepEqual(health.deletes, ['reentrant-uuid']);
});
