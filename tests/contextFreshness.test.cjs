const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

function loadTs(file, mocks) {
  const sourcePath = path.resolve(__dirname, '..', 'lib', file);
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: sourcePath,
  }).outputText;
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = new Module(sourcePath, module);
    loaded.filename = sourcePath;
    loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
    loaded._compile(compiled, sourcePath);
    return loaded.exports;
  } finally { Module._load = originalLoad; }
}

test('local lifecycle schedules the nearest boundary and cancellation stops it', () => {
  let now = new Date(2026, 8, 8, 17, 59, 30);
  let timer;
  let boundaries = 0;
  const lifecycle = loadTs('contextRefreshLifecycle.ts', {}).createContextRefreshLifecycle({
    boundaries: [[0, 0], [18, 0]], onBoundary: () => boundaries++, now: () => now,
    setTimer: (fn, delay) => { timer = { fn, delay }; return timer; }, clearTimer: value => { value.cleared = true; },
  });
  assert.equal(timer.delay, 30_025);
  now = new Date(2026, 8, 8, 18, 0, 0);
  timer.fn();
  assert.equal(boundaries, 1);
  assert.equal(timer.delay, 21_600_025);
  lifecycle();
  assert.equal(timer.cleared, true);
});

test('generation token rejects stale async work and resolveWithin settles rejection', async () => {
  const lifecycle = loadTs('contextRefreshLifecycle.ts', {});
  const gate = lifecycle.createRefreshGeneration();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(await lifecycle.resolveWithin(Promise.reject(new Error('native failed')), 100), null);
});

test('resolveWithin settles a hanging operation at its timeout', async () => {
  const lifecycle = loadTs('contextRefreshLifecycle.ts', {});
  assert.equal(await lifecycle.resolveWithin(new Promise(() => {}), 5), null);
});

function createHookHarness() {
  const values = []; const refs = []; const effects = []; let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ?? (refs[index] = { current: initial }); },
    useEffect(effect, deps) { const index = cursor++; const previous = effects[index]; if (!previous || !same(previous.deps, deps)) { previous?.cleanup?.(); effects[index] = { deps, cleanup: effect() }; } },
  };
  return { react, render(hook, enabled) { cursor = 0; return hook(enabled); }, unmount() { effects.forEach(effect => effect?.cleanup?.()); } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('weather hook clears and ignores a late result after disable, and refreshes on foreground', async () => {
  const harness = createHookHarness();
  const listeners = []; let weatherCalls = 0; let resolveLocation;
  const appState = { currentState: 'active', addEventListener: (_event, listener) => { listeners.push(listener); return { remove() {} }; } };
  const hook = loadTs('useWeatherContext.ts', {
    react: harness.react,
    'react-native': { AppState: appState },
    'expo-location': { PermissionStatus: { GRANTED: 'granted' }, Accuracy: { Balanced: 1 }, getForegroundPermissionsAsync: async () => ({ status: 'granted' }), getCurrentPositionAsync: () => new Promise(resolve => { resolveLocation = resolve; }) },
    './weather': { isWeatherAvailable: () => true, fetchTodayWeather: async () => { weatherCalls++; return { forecastHighF: 85, currentTempF: 82, conditionSummary: 'Clear' }; } },
    './dateUtils': { getTodayString: () => '2026-09-08' },
    './contextRefreshLifecycle': { createRefreshGeneration: loadTs('contextRefreshLifecycle.ts', {}).createRefreshGeneration, resolveWithin: promise => promise, createContextRefreshLifecycle: () => Object.assign(() => {}, { reschedule() {} }) },
    '../constants': {},
  }).useWeatherContext;
  harness.render(hook, true);
  await flush();
  harness.render(hook, false);
  resolveLocation({ coords: { latitude: 1, longitude: 1 } });
  await flush(); await flush();
  let state = harness.render(hook, false);
  assert.equal(state.status, 'disabled');
  assert.equal(state.detectedClimate, null);
  assert.equal(weatherCalls, 0);

  harness.render(hook, true);
  await flush();
  resolveLocation({ coords: { latitude: 1, longitude: 1 } });
  await flush(); await flush();
  listeners.at(-1)('background');
  listeners.at(-1)('active');
  await flush();
  resolveLocation({ coords: { latitude: 1, longitude: 1 } });
  await flush(); await flush();
  state = harness.render(hook, true);
  assert.equal(weatherCalls, 2);
  assert.equal(state.status, 'success');
  assert.equal(state.detectedClimate, 'hot');
  harness.unmount();
});

test('weather does not run while initially backgrounded and clears a prior success when permission is revoked', async () => {
  const harness = createHookHarness();
  const listeners = []; let permission = 'granted'; let fetches = 0; let scheduled = 0;
  const appState = { currentState: null, addEventListener: (_event, listener) => { listeners.push(listener); return { remove() {} }; } };
  const hook = loadTs('useWeatherContext.ts', {
    react: harness.react,
    'react-native': { AppState: appState },
    'expo-location': { PermissionStatus: { GRANTED: 'granted' }, Accuracy: { Balanced: 1 }, getForegroundPermissionsAsync: async () => ({ status: permission }), getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 1 } }) },
    './weather': { isWeatherAvailable: () => true, fetchTodayWeather: async () => { fetches++; return { forecastHighF: 85, currentTempF: 80, conditionSummary: 'Clear' }; } },
    './dateUtils': { getTodayString: () => '2026-09-08' },
    './contextRefreshLifecycle': { createRefreshGeneration: loadTs('contextRefreshLifecycle.ts', {}).createRefreshGeneration, resolveWithin: promise => promise, createContextRefreshLifecycle: () => { scheduled++; return Object.assign(() => {}, { reschedule() {} }); } },
    '../constants': {},
  }).useWeatherContext;
  harness.render(hook, true);
  await flush();
  assert.equal(fetches, 0);
  assert.equal(scheduled, 0);
  listeners[0]('active');
  await flush(); await flush();
  assert.equal(fetches, 1);
  assert.equal(harness.render(hook, true).detectedClimate, 'hot');
  listeners[0]('active');
  await flush();
  assert.equal(fetches, 1);
  permission = 'denied';
  listeners[0]('background');
  listeners[0]('active');
  await flush(); await flush();
  const state = harness.render(hook, true);
  assert.equal(state.status, 'denied');
  assert.equal(state.detectedClimate, null);
  assert.equal(state._debug.permissionStatus, 'denied');
  harness.unmount();
});

test('activity thresholds are strict at each boundary and low waits until 18:00', () => {
  const activity = loadTs('useHealthKitActivity.ts', {
    react: {},
    'react-native': {},
    './healthKit': {},
    './contextRefreshLifecycle': {},
    './dateUtils': {},
    '../constants': {},
  });
  assert.deepEqual(activity.deriveActivitySuggestion(3999, 17), { suggestedLevel: null, suggestionEligible: false });
  assert.deepEqual(activity.deriveActivitySuggestion(4000, 17), { suggestedLevel: 'medium', suggestionEligible: true });
  assert.deepEqual(activity.deriveActivitySuggestion(7999, 17), { suggestedLevel: 'medium', suggestionEligible: true });
  assert.deepEqual(activity.deriveActivitySuggestion(8000, 0), { suggestedLevel: 'high', suggestionEligible: true });
  assert.deepEqual(activity.deriveActivitySuggestion(3999, 18), { suggestedLevel: 'low', suggestionEligible: true });
});

test('weather refreshes its ephemeral payload at the local midnight boundary', async () => {
  const harness = createHookHarness();
  const boundaries = []; let today = '2026-09-08'; let fetches = 0;
  const appState = { currentState: 'active', addEventListener: (_event, listener) => ({ remove() { void listener; } }) };
  const hook = loadTs('useWeatherContext.ts', {
    react: harness.react,
    'react-native': { AppState: appState },
    'expo-location': { PermissionStatus: { GRANTED: 'granted' }, Accuracy: { Balanced: 1 }, getForegroundPermissionsAsync: async () => ({ status: 'granted' }), getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 1 } }) },
    './weather': { isWeatherAvailable: () => true, fetchTodayWeather: async () => { fetches++; return { forecastHighF: 70, currentTempF: 68, conditionSummary: 'Clear' }; } },
    './dateUtils': { getTodayString: () => today },
    './contextRefreshLifecycle': { createRefreshGeneration: loadTs('contextRefreshLifecycle.ts', {}).createRefreshGeneration, resolveWithin: promise => promise, createContextRefreshLifecycle: options => { boundaries.push(options.onBoundary); return Object.assign(() => {}, { reschedule() {} }); } },
    '../constants': {},
  }).useWeatherContext;
  harness.render(hook, true);
  await flush(); await flush();
  assert.equal(fetches, 1);
  today = '2026-09-09';
  boundaries[0]();
  await flush(); await flush();
  assert.equal(fetches, 2);
  harness.unmount();
});

test('HealthKit hook refreshes at 18:00 and never publishes a superseded midnight query', async () => {
  const harness = createHookHarness();
  const listeners = []; const boundaries = []; const pending = []; let today = '2026-09-08';
  const appState = { currentState: 'active', addEventListener: (_event, listener) => { listeners.push(listener); return { remove() {} }; } };
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [2026, 8, 8, 17, 59])); } };
  try {
    const hook = loadTs('useHealthKitActivity.ts', {
      react: harness.react,
      'react-native': { AppState: appState },
      './healthKit': { isHealthKitAvailable: () => true, readTodayStepCount: () => new Promise(resolve => pending.push(resolve)) },
      './dateUtils': { getTodayString: () => today },
      './contextRefreshLifecycle': { createRefreshGeneration: loadTs('contextRefreshLifecycle.ts', {}).createRefreshGeneration, resolveWithin: promise => promise, createContextRefreshLifecycle: options => { boundaries.push(options.onBoundary); return Object.assign(() => {}, { reschedule() {} }); } },
      '../constants': {},
    }).useHealthKitActivity;
    harness.render(hook, true);
    assert.equal(pending.length, 1);
    boundaries[0](); // 18:00 boundary starts a replacement request.
    assert.equal(pending.length, 2);
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [2026, 8, 8, 18, 0])); } };
    pending[1](1000);
    await flush();
    let state = harness.render(hook, true);
    assert.equal(state.suggestedLevel, 'low');
    listeners[0]('background');
    listeners[0]('active'); // a current-day request is now outstanding.
    assert.equal(pending.length, 3);
    today = '2026-09-09';
    boundaries[0](); // midnight replacement invalidates that old-day request.
    assert.equal(pending.length, 4);
    pending[2](9000);
    pending[3](4500);
    await flush(); await flush();
    state = harness.render(hook, true);
    assert.equal(state.stepsToday, 4500);
    assert.equal(state.suggestedLevel, 'medium');
    harness.unmount();
  } finally { global.Date = RealDate; }
});
