#!/usr/bin/env node
/**
 * tests/run.js - run every check. Zero dependencies, plain Node.
 *
 *   node tests/run.js
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const suites = ['test-effects.js', 'test-ui.js'];
let failed = 0;

for (const s of suites) {
  console.log('\n============================================================');
  console.log('  ' + s);
  console.log('============================================================');
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log('\n============================================================');
console.log(failed === 0 ? '  ALL SUITES PASSED' : `  ${failed} SUITE(S) FAILED`);
console.log('============================================================');
process.exit(failed === 0 ? 0 : 1);
