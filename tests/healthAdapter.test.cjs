const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

test('all HealthKit operations degrade safely when native require throws', async () => {
  const sourcePath = path.resolve(__dirname, '..', 'lib', 'healthKit.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText;

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'react-native') return { Platform: { OS: 'ios' } };
    if (request === '@kingstinct/react-native-healthkit') {
      throw new Error('HealthKit native module unavailable');
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const adapter = new Module(sourcePath, module);
    adapter.filename = sourcePath;
    adapter.paths = Module._nodeModulePaths(path.dirname(sourcePath));
    adapter._compile(compiled, sourcePath);

    assert.equal(adapter.exports.isHealthKitAvailable(), false);
    assert.equal(await adapter.exports.requestHealthKitAuthorization(), false);
    assert.equal(await adapter.exports.writeDrinkSample(8, new Date().toISOString()), null);
    await adapter.exports.deleteDrinkSample('sample-id');
    assert.equal(await adapter.exports.requestHealthKitActivityAuthorization(), false);
    assert.equal(await adapter.exports.readTodayStepCount(), null);
  } finally {
    Module._load = originalLoad;
  }
});
