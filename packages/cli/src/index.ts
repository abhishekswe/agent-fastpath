#!/usr/bin/env node
/**
 * agentctl-fastpath CLI
 */

import { Command } from 'commander';
import { runStdioServer } from '@agentctl/mcp-server';
import { CapabilityRouter } from '@agentctl/core';
import { TypeSafeJudgmentProvider, MockTypeSafeProvider } from '@agentctl/provider-typesafe';
import { chromium } from 'playwright';

const program = new Command();

program
  .name('agentctl-fastpath')
  .description('Local-first MCP acceleration layer for AI coding agents')
  .version('0.1.0');

program
  .command('start')
  .description('Start the agentctl-fastpath MCP server over stdio')
  .action(async () => {
    await runStdioServer();
  });

program
  .command('doctor')
  .description('Verify system environment, API credentials, and browser runtime')
  .action(async () => {
    console.log('🩺 Running agentctl-fastpath environment doctor...\n');

    // 1. Node.js check
    const nodeVer = process.version;
    console.log(`• Node.js version: ${nodeVer} (${parseInt(nodeVer.slice(1)) >= 20 ? '✅ PASS' : '❌ FAIL, requires Node 20+'})`);

    // 2. TypeSafe API Key
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (apiKey) {
      console.log(`• TypeSafe API Key: Configured (${apiKey.slice(0, 6)}...${apiKey.slice(-4)}) ✅`);
    } else {
      console.log('• TypeSafe API Key: NOT SET (Falling back to deterministic mock provider for local testing) ⚠️');
    }

    // 3. Playwright browser check
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      console.log('• Playwright Chromium Engine: Available ✅');
    } catch (err: any) {
      console.log(`• Playwright Chromium Engine: Failed to launch (${err.message}) ❌`);
      console.log('  Run "npx playwright install chromium" to install missing browser binaries.');
    }

    console.log('\nSystem check complete.');
  });

program
  .command('eval')
  .description('Execute a standalone fast-path evaluation from the command line')
  .option('-p, --preset <preset>', 'Preset name (e.g. relevance, ship_gate, risk)', 'relevance')
  .option('-s, --state <state>', 'State content to evaluate', 'All 42 unit tests passed cleanly.')
  .option('-q, --query <query>', 'Optional query parameter', 'test status')
  .action(async (opts) => {
    const provider = process.env.TYPESAFE_API_KEY
      ? new TypeSafeJudgmentProvider()
      : new MockTypeSafeProvider();

    const router = new CapabilityRouter({ judgmentProvider: provider });
    const res = await router.evaluate({
      state: opts.state,
      preset: opts.preset,
      presetParams: { query: opts.query }
    });

    console.log(JSON.stringify(res, null, 2));
  });

program
  .command('install-config')
  .description('Print MCP configuration snippet for Claude Code, Cursor, or Codex')
  .argument('[client]', 'Target client (claude-code, cursor, codex)', 'claude-code')
  .action((client) => {
    console.log(`\n📋 Configuration for ${client}:\n`);

    if (client === 'cursor') {
      const config = {
        mcpServers: {
          'agentctl-fastpath': {
            command: 'npx',
            args: ['-y', 'agentctl-fastpath', 'start'],
            env: {
              TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY || 'your_api_key_here'
            }
          }
        }
      };
      console.log('Add to ~/.cursor/mcp.json:');
      console.log(JSON.stringify(config, null, 2));
    } else if (client === 'claude-code') {
      console.log('Run in your terminal:');
      console.log('  claude mcp add agentctl-fastpath -- npx -y agentctl-fastpath start');
    } else {
      console.log('Generic stdio configuration:');
      console.log('  Command: npx -y agentctl-fastpath start');
      console.log('  Environment: TYPESAFE_API_KEY=<your_key>');
    }
    console.log();
  });

program.parse(process.argv);
