const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

global.__DEV__ = false;

const calculatePath = path.resolve(__dirname, '..', 'lib', 'calculateGoal.ts');
const constantsPath = path.resolve(__dirname, '..', 'constants', 'index.ts');

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName,
  }).outputText;
}

function loadTranspiled(sourcePath, compiled, constantsExports) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../constants' && parent && parent.filename === sourcePath) {
      return constantsExports;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = new Module(sourcePath, module);
    loaded.filename = sourcePath;
    loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
    loaded._compile(compiled, sourcePath);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const constants = loadTranspiled(
  constantsPath,
  transpile(fs.readFileSync(constantsPath, 'utf8'), constantsPath),
  {},
);
const { calculateGoal } = loadTranspiled(
  calculatePath,
  transpile(fs.readFileSync(calculatePath, 'utf8'), calculatePath),
  constants,
);

function inputs(overrides = {}) {
  return {
    weightLb: 200,
    age: 25,
    sex: 'female',
    activityLevel: 'low',
    climate: 'cool',
    ...overrides,
  };
}

function goal(overrides = {}) {
  const result = calculateGoal(inputs(overrides));
  assert.equal(result.recommendedGoalOz, result.dailyGoalOz);
  return result.recommendedGoalOz;
}

test('applies the locked sex adjustments', () => {
  assert.equal(goal({ sex: 'female' }), 80);
  assert.equal(goal({ sex: 'male' }), 88);
  assert.equal(goal({ sex: 'other' }), 84);
});

test('applies every locked age bucket boundary', () => {
  assert.equal(goal({ age: 17 }), 72);
  assert.equal(goal({ age: 18 }), 80);
  assert.equal(goal({ age: 34 }), 80);
  assert.equal(goal({ age: 35 }), 84);
  assert.equal(goal({ age: 54 }), 84);
  assert.equal(goal({ age: 55 }), 88);
});

test('applies the locked activity adjustments', () => {
  assert.equal(goal({ activityLevel: 'low' }), 80);
  assert.equal(goal({ activityLevel: 'medium' }), 84);
  assert.equal(goal({ activityLevel: 'high' }), 88);
});

test('applies the locked climate adjustments', () => {
  assert.equal(goal({ climate: 'cool' }), 80);
  assert.equal(goal({ climate: 'moderate' }), 84);
  assert.equal(goal({ climate: 'hot' }), 88);
});

test('rounds to the nearest four ounces and sends exact ties down', () => {
  assert.equal(goal({ weightLb: 125 }), 48); // 125 × .40 = 50, midpoint between 48 and 52
  assert.equal(goal({ weightLb: 127.5 }), 52); // 51 is strictly closer to 52
});

test('clamps rounded goals to the locked minimum and maximum', () => {
  assert.equal(goal({ weightLb: 1 }), 48);
  assert.equal(goal({ weightLb: 500 }), 160);
});

test('uses the locked fallback for invalid numeric inputs', () => {
  for (const field of ['weightLb', 'age']) {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.deepEqual(calculateGoal(inputs({ [field]: value })), {
        recommendedGoalOz: 72,
        dailyGoalOz: 72,
      });
    }
  }
});

test('uses the locked fallback when a required input is missing', () => {
  for (const field of ['weightLb', 'age', 'sex', 'activityLevel', 'climate']) {
    assert.deepEqual(calculateGoal(inputs({ [field]: null })), {
      recommendedGoalOz: 72,
      dailyGoalOz: 72,
    });
  }
});
