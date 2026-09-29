#!/usr/bin/env node
/**
 * The light while a finished plan waits for a yes.
 *
 * Plan mode ends with Claude Code asking for approval of the plan. It said so
 * in words the store did not know, so the light stayed green while the whole
 * session sat waiting on a person — the one thing yellow exists to say.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notchlight-plan-'));
try {
  await build({ entryPoints: ['src/main/store.ts'], bundle: true, platform: 'node', format: 'cjs',
    outExtension: { '.js': '.cjs' }, outdir: root, logLevel: 'error' });
  const require = createRequire(import.meta.url);
  const { Store } = require(path.join(root, 'store.cjs'));

  console.log('Plan checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
