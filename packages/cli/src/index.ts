#!/usr/bin/env node
/**
 * agent-fastpath CLI.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import { CapabilityRouter, PRESET_REGISTRY } from '@agent-fastpath/core';
import { VERSION, createJudgmentProvider, runStdioServer } from '@agent-fastpath/mcp-server';

// A .env in the working directory is a convenience for local use. MCP clients should
// pass TYPESAFE_API_KEY through their server config instead.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Malformed .env: ignore, the doctor command reports the missing key.
  }
}

const program = new Command();

program
  .name('agent-fastpath')
  .description('MCP server that gives coding agents fast typed decisions, file triage, and a bounded browser')
  .version(VERSION);

program
  .command('start')
  .description('Start the MCP server over stdio')
  .action(async () => {
    await runStdioServer();
  });

program
  .command('doctor')
  .description('Check Node.js, the API key, and the browser runtime')
  .action(async () => {
    let ok = true;
    const line = (pass: boolean, label: string, detail: string) => {
      if (!pass) ok = false;
      console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}: ${detail}`);
    };

    const major = Number(process.versions.node.split('.')[0]);
    line(major >= 20, 'Node.js', `${process.version}${major >= 20 ? '' : ' (need 20 or newer)'}`);

    const provider = createJudgmentProvider();
    if (provider.available) {
      const health = await provider.checkHealth();
      line(health.healthy, 'Judgment provider', health.healthy ? `${provider.id} reachable (${health.latencyMs} ms)` : health.error ?? 'unreachable');
    } else {
      console.log('warn  Judgment provider: TYPESAFE_API_KEY not set. Deterministic checks work; semantic questions will escalate.');
    }

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      line(true, 'Browser', 'Chromium launches');
    } catch (err: any) {
      line(false, 'Browser', `${String(err.message).split('\n')[0]}. Run: npx playwright install chromium`);
    }

    console.log('info  MCP install: npx -y agent-fastpath start');

    process.exitCode = ok ? 0 : 1;
  });

program
  .command('eval')
  .description('Run one evaluation from the command line and print the JSON result')
  .requiredOption('-s, --state <text>', 'Text to evaluate')
  .option('-p, --preset <name>', `Preset (${Object.keys(PRESET_REGISTRY).join(', ')})`, 'relevance')
  .option('-q, --query <text>', 'Query for the relevance preset')
  .option('-c, --claim <text>', 'Claim for the verify_claim preset')
  .action(async (opts) => {
    const router = new CapabilityRouter({ judgmentProvider: createJudgmentProvider() });
    const presetParams: Record<string, unknown> = {};
    if (opts.query) presetParams.query = opts.query;
    if (opts.claim) presetParams.claim = opts.claim;
    const res = await router.evaluate({ state: opts.state, preset: opts.preset, presetParams });
    console.log(JSON.stringify(res, null, 2));
  });

program
  .command('install-config')
  .description('Print the MCP configuration for a client')
  .argument('[client]', 'claude-code, cursor, or codex', 'claude-code')
  .action((client: string) => {
    const serverEntry = {
      command: 'npx',
      args: ['-y', 'agent-fastpath', 'start'],
      env: { TYPESAFE_API_KEY: '<your-typesafe-api-key>' }
    };
    if (client === 'claude-code') {
      console.log('claude mcp add agent-fastpath -s user -e TYPESAFE_API_KEY=<your-typesafe-api-key> -- npx -y agent-fastpath start');
    } else if (client === 'cursor') {
      console.log('Add to ~/.cursor/mcp.json:\n');
      console.log(JSON.stringify({ mcpServers: { 'agent-fastpath': serverEntry } }, null, 2));
    } else if (client === 'codex') {
      console.log('Add to ~/.codex/config.toml:\n');
      console.log('[mcp_servers.agent-fastpath]');
      console.log('command = "npx"');
      console.log('args = ["-y", "agent-fastpath", "start"]');
      console.log('env = { TYPESAFE_API_KEY = "<your-typesafe-api-key>" }');
    } else {
      console.error(`Unknown client "${client}". Use claude-code, cursor, or codex.`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
