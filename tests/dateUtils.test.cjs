const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};

const { getDaysBetween } = require(path.resolve(__dirname, '../lib/dateUtils.ts'));

test('local calendar day differences cover boundaries and backward clock direction', () => {
  assert.equal(getDaysBetween('2026-03-08', '2026-03-08'), 0);
  assert.equal(getDaysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(getDaysBetween('2026-03-08', '2026-03-09'), 1);
  assert.equal(getDaysBetween('2026-11-01', '2026-11-02'), 1);
  assert.equal(getDaysBetween('2026-03-09', '2026-03-08'), -1);
});
