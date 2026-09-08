const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

global.__DEV__ = false;

const adapterPath = require.resolve('../lib/weather.ts');
const source = fs.readFileSync(adapterPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadAdapter() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'react-native') return { Platform: { OS: 'ios' } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const adapter = new Module(adapterPath);
    adapter.filename = adapterPath;
    adapter.paths = Module._nodeModulePaths(path.resolve(__dirname, '../lib'));
    adapter._compile(compiled, adapter.filename);
    return adapter.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const { fetchTodayWeather } = loadAdapter();

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

test('fetchTodayWeather returns validated Open-Meteo data and passes an abort signal', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response({
      daily: { temperature_2m_max: [60] },
      current: { temperature_2m: 32, weathercode: 0 },
    });
  };
  try {
    assert.deepEqual(await fetchTodayWeather(40, -75), {
      forecastHighF: 60,
      currentTempF: 32,
      conditionSummary: 'Clear',
    });
    assert.match(request.url, /temperature_unit=fahrenheit/);
    assert.equal(request.options.signal instanceof AbortSignal, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchTodayWeather preserves the forecast temperatures used by climate buckets', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => response({ daily: { temperature_2m_max: [60] } });
  try {
    assert.equal((await fetchTodayWeather(0, 0)).forecastHighF, 60);
    global.fetch = async () => response({ daily: { temperature_2m_max: [80] } });
    assert.equal((await fetchTodayWeather(0, 0)).forecastHighF, 80);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchTodayWeather rejects malformed temperatures and weather codes', async () => {
  const originalFetch = global.fetch;
  const payloads = [
    { daily: { temperature_2m_max: [Number.NaN] } },
    { daily: { temperature_2m_max: [70] }, current: { temperature_2m: 151 } },
    { daily: { temperature_2m_max: [70] }, current: { weathercode: 100 } },
  ];
  try {
    for (const payload of payloads) {
      global.fetch = async () => response(payload);
      assert.equal(await fetchTodayWeather(0, 0), null);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchTodayWeather returns null when the bounded request aborts', async () => {
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback;
  let cleared = false;
  global.setTimeout = (callback) => {
    timeoutCallback = callback;
    return 123;
  };
  global.clearTimeout = (id) => {
    if (id === 123) cleared = true;
  };
  global.fetch = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  try {
    const resultPromise = fetchTodayWeather(0, 0);
    timeoutCallback();
    assert.equal(await resultPromise, null);
    assert.equal(cleared, true);
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('fetchTodayWeather returns null for network, HTTP, and JSON failures', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal(await fetchTodayWeather(0, 0), null);
    global.fetch = async () => response({}, false);
    assert.equal(await fetchTodayWeather(0, 0), null);
    global.fetch = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
    assert.equal(await fetchTodayWeather(0, 0), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchTodayWeather rejects invalid coordinates before making a request', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return response({ daily: { temperature_2m_max: [70] } });
  };
  try {
    assert.equal(await fetchTodayWeather(Number.NaN, 0), null);
    assert.equal(await fetchTodayWeather(91, 0), null);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
