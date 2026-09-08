const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

function loadApp(mocks) {
  const sourcePath = path.resolve(__dirname, '..', 'App.tsx');
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
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
    return loaded.exports.default;
  } finally {
    Module._load = originalLoad;
  }
}

function createHookHarness() {
  const values = [];
  const callbacks = [];
  const effects = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], next => {
        values[index] = typeof next === 'function' ? next(values[index]) : next;
      }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!callbacks[index] || !same(callbacks[index].deps, deps)) callbacks[index] = { callback, deps };
      return callbacks[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || !same(previous.deps, deps)) {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      }
    },
  };
  return {
    react,
    render(component) { cursor = 0; return component(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

function makeElementMocks() {
  const element = (type, props, ...children) => ({ type, props: props || {}, children: children.flat().filter(child => child !== undefined && child !== null) });
  return {
    StatusBar: props => element('StatusBar', props),
    Pressable: (props, ...children) => element('Pressable', props, ...children),
    StyleSheet: { create: styles => styles },
    Text: (props, ...children) => element('Text', props, ...children),
    View: (props, ...children) => element('View', props, ...children),
    React: {
      Fragment: 'Fragment',
      createElement: (type, props, ...children) => typeof type === 'function' ? type({ ...(props || {}), children }) : element(type, props, ...children),
    },
  };
}

function textOf(tree) {
  if (tree === undefined || tree === null || typeof tree === 'boolean') return '';
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return [tree.children, tree.props?.children].flat().filter(Boolean).map(textOf).join('');
}

function find(tree, type) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  for (const child of [...(tree.children || []), tree.props?.children]) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

function setupApp({ profileStatus = 'ready', hydrationStatus = 'ready', onboardingComplete = true, appState = 'active' } = {}) {
  const rn = makeElementMocks();
  const listeners = [];
  const retryProfile = []; const retryHydration = []; const dayChecks = [];
  let profile = { weightLb: 150, age: 30, sex: 'female', activityLevel: 'moderate', climate: 'temperate' };
  const profileStore = Object.assign(
    selector => selector({ persistenceStatus: profileStatus, onboardingComplete, retryHydration: () => retryProfile.push(true) }),
    { getState: () => profile },
  );
  const hydrationStore = Object.assign(
    selector => selector({ persistenceStatus: hydrationStatus, retryHydration: () => retryHydration.push(true) }),
    { getState: () => ({ runNewDayCheck: args => dayChecks.push({ ...args }) }) },
  );
  const state = { currentState: appState, addEventListener: (_event, listener) => { listeners.push(listener); return { remove: () => { state.removed = true; } }; } };
  const components = {
    './components/DevDebugPanel': { DevDebugPanel: () => rn.View({}, 'debug') },
    './components/HomeScreen': { HomeScreen: () => rn.View({}, 'home') },
    './components/OnboardingFlow': { OnboardingFlow: () => rn.View({}, 'onboarding') },
    './constants/theme': { fontSize: { body: 16 }, palette: { bg: 'white', inkSoft: 'gray', ink: 'black', white: 'white' } },
    './store/useHydrationStore': { useHydrationStore: hydrationStore },
    './store/useProfileStore': { useProfileStore: profileStore },
    'expo-status-bar': { StatusBar: rn.StatusBar },
    'react-native': { AppState: state, Pressable: rn.Pressable, StyleSheet: rn.StyleSheet, Text: rn.Text, View: rn.View },
    react: { default: rn.React, Fragment: rn.React.Fragment, createElement: rn.React.createElement, useCallback: null, useEffect: null, useState: null },
  };
  const harness = createHookHarness();
  components.react.useCallback = harness.react.useCallback;
  components.react.useEffect = harness.react.useEffect;
  components.react.useState = harness.react.useState;
  const App = loadApp(components);
  return { App, harness, listeners, state, dayChecks, retryProfile, retryHydration, setProfile(next) { profile = { ...profile, ...next }; }, setStatuses(next) { if (next.profileStatus) profileStatus = next.profileStatus; if (next.hydrationStatus) hydrationStatus = next.hydrationStatus; }, textOf };
}

test('App gates Home until both stores are ready and the initial day check completes', () => {
  global.__DEV__ = false;
  const app = setupApp({ profileStatus: 'loading', hydrationStatus: 'loading' });
  let tree = app.harness.render(app.App);
  assert.match(app.textOf(tree), /Loading/);
  assert.equal(app.dayChecks.length, 0);
  app.setStatuses({ profileStatus: 'ready' });
  tree = app.harness.render(app.App);
  assert.match(app.textOf(tree), /Loading/);
  assert.equal(app.dayChecks.length, 0);
  app.setStatuses({ hydrationStatus: 'ready' });
  tree = app.harness.render(app.App);
  assert.match(app.textOf(tree), /Loading/);
  assert.equal(app.dayChecks.length, 1);
  assert.equal(app.dayChecks[0].weightLb, 150);
  tree = app.harness.render(app.App);
  assert.match(app.textOf(tree), /home/);
  assert.doesNotMatch(app.textOf(tree), /Loading/);
  app.harness.unmount();
});

test('App shows Retry for persistence errors and retries only failed stores', () => {
  global.__DEV__ = false;
  for (const statuses of [
    { profileStatus: 'error', hydrationStatus: 'ready', profileRetries: 1, hydrationRetries: 0 },
    { profileStatus: 'ready', hydrationStatus: 'error', profileRetries: 0, hydrationRetries: 1 },
    { profileStatus: 'error', hydrationStatus: 'error', profileRetries: 1, hydrationRetries: 1 },
  ]) {
    const app = setupApp(statuses);
    const tree = app.harness.render(app.App);
    assert.match(app.textOf(tree), /could not be loaded/);
    const retry = find(tree, 'Pressable');
    assert.ok(retry);
    retry.props.onPress();
    assert.equal(app.retryProfile.length, statuses.profileRetries);
    assert.equal(app.retryHydration.length, statuses.hydrationRetries);
    assert.equal(app.dayChecks.length, 0);
    app.harness.unmount();
  }
});

test('App checks fresh profile data on midnight and foreground, then cleans up timer and listener', () => {
  global.__DEV__ = false;
  const RealDate = Date;
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  const timers = [];
  let now = [2026, 8, 8, 23, 59, 59, 500];
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : now)); }
  };
  global.setTimeout = (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; };
  global.clearTimeout = timer => { timer.cleared = true; };
  try {
    const app = setupApp();
    app.harness.render(app.App);
    app.harness.render(app.App); // flush state from the initial check and install lifecycle effect
    assert.equal(app.dayChecks.length, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 500);

    app.setProfile({ weightLb: 175, climate: 'hot' });
    now = [2026, 8, 9, 0, 0, 0, 0];
    timers[0].fn();
    assert.equal(app.dayChecks.length, 2);
    assert.equal(app.dayChecks[1].weightLb, 175);
    assert.equal(app.dayChecks[1].climate, 'hot');
    assert.equal(timers.length, 2);
    assert.equal(timers[1].delay, 86_400_000);

    app.listeners[0]('background');
    assert.equal(timers[1].cleared, true);
    app.setProfile({ weightLb: 180 });
    app.listeners[0]('active');
    assert.equal(app.dayChecks.length, 3);
    assert.equal(app.dayChecks[2].weightLb, 180);
    assert.equal(timers.length, 3);

    app.harness.unmount();
    assert.equal(timers[2].cleared, true);
    assert.equal(app.state.removed, true);
  } finally {
    global.Date = RealDate;
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }
});

test('App waits to schedule until an initially backgrounded app becomes active', () => {
  global.__DEV__ = false;
  const realSetTimeout = global.setTimeout;
  const timers = [];
  global.setTimeout = (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; };
  try {
    const app = setupApp({ appState: 'background' });
    app.harness.render(app.App);
    app.harness.render(app.App);
    assert.equal(timers.length, 0);
    app.listeners[0]('active');
    assert.equal(timers.length, 1);
    assert.equal(app.dayChecks.length, 2);
    app.harness.unmount();
  } finally {
    global.setTimeout = realSetTimeout;
  }
});
