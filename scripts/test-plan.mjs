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
  await build({ entryPoints: ['src/main/store.ts', 'src/main/hookServer.ts'], bundle: true, platform: 'node', format: 'cjs',
    outExtension: { '.js': '.cjs' }, outdir: root, logLevel: 'error' });
  const require = createRequire(import.meta.url);
  const { Store } = require(path.join(root, 'store.cjs'));
  const { HookServer } = require(path.join(root, 'hookServer.cjs'));

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

  // A Claude Code old enough to send no kind at all: the wording has to do.
  const worded = fresh('worded');
  hook(worded, 'worded', 'UserPromptSubmit');
  hook(worded, 'worded', 'Notification', { message: PLAN });
  assert.equal(status(worded, 'worded'), 'asking', 'the plan wording alone is a question');

  // The nudge a minute after a finished turn must stay the non-question it is.
  const idle = fresh('idle');
  hook(idle, 'idle', 'UserPromptSubmit');
  hook(idle, 'idle', 'Stop');
  hook(idle, 'idle', 'Notification', { message: 'Claude is waiting for your input', notificationType: 'idle_prompt' });
  assert.equal(status(idle, 'idle'), 'done', 'an idle_prompt leaves a finished session red');
  const busy = fresh('busy');
  hook(busy, 'busy', 'UserPromptSubmit');
  hook(busy, 'busy', 'Notification', { message: 'Claude is waiting for your input', notificationType: 'idle_prompt' });
  assert.equal(status(busy, 'busy'), 'working', 'an idle_prompt is no question mid-turn either');

  // Turned down with Escape, no hook says so; the transcript moving on does.
  const refused = fresh('refused');
  hook(refused, 'refused', 'UserPromptSubmit');
  hook(refused, 'refused', 'Notification', { message: PLAN, notificationType: 'permission_prompt' });
  assert.equal(status(refused, 'refused'), 'asking');
  const later = Date.now() + 5000;
  refused.facts.set('refused', { ...facts('refused'), lastAt: later, mainLastAt: later });
  assert.notEqual(status(refused, 'refused'), 'asking', 'a refused plan does not stay yellow');

  console.log('Plan checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
