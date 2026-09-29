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

  const facts = (sessionId) => {
    const at = Date.now() - 1000;
    return { sessionId, cwd: '/tmp/plan', file: '', project: 'plan', title: '', startedAt: at - 60_000,
      lastAt: at, mainLastAt: at, tokens: 0, agents: [], busy: false, tail: [] };
  };
  /** A store with one session in it, its transcript already seen. */
  const fresh = (id) => {
    const store = new Store();
    store.facts.set(id, facts(id));
    return store;
  };
  const hook = (store, id, event, extra = {}) => store.onHook({ event, sessionId: id, cwd: '/tmp/plan', ...extra });
  const status = (store, id) => store.snapshot().sessions.find((s) => s.id === id)?.status;

  const PLAN = 'Claude Code needs your approval for the plan';

  // Plan mode, as Claude Code 2.1 sends it: ExitPlanMode starts, then the
  // dialog's Notification arrives as a permission_prompt.
  const planned = fresh('planned');
  hook(planned, 'planned', 'UserPromptSubmit');
  hook(planned, 'planned', 'PreToolUse', { toolName: 'ExitPlanMode' });
  assert.equal(status(planned, 'planned'), 'working', 'writing the plan is work');
  hook(planned, 'planned', 'Notification', { message: PLAN, notificationType: 'permission_prompt' });
  assert.equal(status(planned, 'planned'), 'asking', 'a plan waiting for approval is yellow');
  assert.equal(planned.snapshot().sessions[0].ask?.message, PLAN, 'the card says what it is waiting on');
  hook(planned, 'planned', 'PostToolUse', { toolName: 'ExitPlanMode' });
  assert.equal(status(planned, 'planned'), 'working', 'approved, it goes back to work');
  assert.equal(planned.snapshot().sessions[0].ask, null, 'and the card goes with the question');

  console.log('Plan checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
