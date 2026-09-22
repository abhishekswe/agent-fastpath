#!/usr/bin/env node
/**
 * agent-fastpath CLI.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import { CapabilityRouter, PRESET_REGISTRY } from '@agent-fastpath/core';
import { VERSION, createJudgmentProvider, runStdioServer } from '@agent-fastpath/mcp-server';
import { CLIENTS, findClient } from './clients.js';

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
  .argument('[client]', CLIENTS.map((c) => c.id).join(', '), 'claude-code')
  .action((id: string) => {
    const client = findClient(id);
    if (!client) {
      console.error(`Unknown client "${id}". Use one of: ${CLIENTS.map((c) => c.id).join(', ')}.`);
      process.exitCode = 1;
      return;
    }
    console.log(client.render());
  });

program.parseAsync(process.argv);
