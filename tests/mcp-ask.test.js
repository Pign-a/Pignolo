'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const ask = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions.ask.filter((r) => r.startsWith('mcp__'));

// Claude Code (permissions, "Deny and ask rules also accept glob patterns in the tool-name position. The pattern must match the full tool name").
const globRegex = (rule) => new RegExp('^' + rule.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const caught = (tool) => ask.filter((r) => globRegex(r).test(tool));

test('las reglas MCP "ask" no atrapan acciones locales ni lecturas del navegador', () => {
  for (const t of ['navigate', 'navigate_back', 'click', 'take_screenshot', 'snapshot', 'type', 'fill_form', 'evaluate', 'tabs', 'wait_for', 'network_requests', 'console_messages', 'hover', 'press_key', 'resize', 'close']) {
    assert.deepStrictEqual(caught(`mcp__playwright__browser_${t}`), [], t);
  }
  assert.ok(!ask.includes('mcp__*__*navigate*'));
});

test('las reglas MCP "ask" siguen atrapando lo que publica, envía o cambia algo remoto', () => {
  for (const t of [
    'mcp__github__create_pull_request', 'mcp__github__create_or_update_file', 'mcp__github__push_files', 'mcp__github__merge_pull_request',
    'mcp__github__update_pull_request', 'mcp__github__delete_file',
    'mcp__claude_ai_Gmail__send_message', 'mcp__slack__slack_send_message', 'mcp__claude_ai_Google_Calendar__create_event',
    'mcp__claude_ai_Supabase__deploy_edge_function', 'mcp__claude_ai_Supabase__merge_branch', 'mcp__claude_ai_Vercel__create_deployment',
    'mcp__claude_ai_Vercel__delete_project', 'mcp__x__publish_post',
  ]) {
    assert.ok(caught(t).length > 0, t);
  }
});
