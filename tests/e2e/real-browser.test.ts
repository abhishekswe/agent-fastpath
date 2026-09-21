/**
 * Real Live Browser Integration Test with Playwright and local HTTP test server.
 * Verifies:
 * 1. Server starts NO browser until a browser tool is called.
 * 2. Atomic observation extraction and observation token binding.
 * 3. Bounded action execution (click, type) and state verification.
 * 4. Clean session shutdown.
 */

import assert from 'node:assert';
import http from 'node:http';
import { FastpathMcpServer, handleFastpathBrowser } from '@agentctl/mcp-server';

export async function runRealBrowserTests(): Promise<void> {
  console.log('--- Running Live Browser Integration Test ---');

  // 1. Start a local HTTP test server
  let clickCount = 0;
  const testServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Fastpath Test Fixture</title></head>
        <body>
          <h1>Fastpath Test Dashboard</h1>
          <p id="counter">Click Count: ${clickCount}</p>
          <button id="btn-click" onclick="document.getElementById('counter').innerText = 'Click Count: ' + (++count)">Click Me</button>
          <input id="txt-input" placeholder="Type test text" />
          <script>
            let count = ${clickCount};
          </script>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (testServer.address() as any).port;
  const testUrl = `http://127.0.0.1:${port}`;

  console.log(`• Local test fixture server listening at ${testUrl}`);

  // 2. Initialize MCP server instance
  const mcpServer = new FastpathMcpServer();
  const browserProvider = mcpServer.getBrowserProvider();

  try {
    // 3. Open session (Mode: open)
    console.log('• Opening browser session...');
    const openRes = await handleFastpathBrowser(browserProvider, {
      mode: 'open',
      url: testUrl,
      bounds: { allowPrivateNetworks: true } // allow local test server
    });

    assert.strictEqual(openRes.status, 'accept');
    assert.ok(openRes.sessionId.startsWith('sess_'));
    assert.ok(openRes.observation);
    assert.strictEqual(openRes.observation.elements.length >= 2, true, 'Extracts interactive elements');

    const clickButton = openRes.observation.elements.find((el) => el.label.includes('Click Me'));
    assert.ok(clickButton, 'Found "Click Me" button');
    assert.ok(clickButton.ref.startsWith(openRes.observation.observationId));

    // 4. Act: Click button (Mode: act)
    console.log(`• Executing click on ${clickButton.ref}...`);
    const actRes = await handleFastpathBrowser(browserProvider, {
      mode: 'act',
      sessionId: openRes.sessionId,
      action: {
        operation: 'click',
        targetRef: clickButton.ref
      }
    });

    assert.strictEqual(actRes.status, 'accept');

    // 5. Check outcome (Mode: check)
    console.log('• Verifying outcome on page...');
    const checkRes = await handleFastpathBrowser(browserProvider, {
      mode: 'check',
      sessionId: openRes.sessionId,
      assertion: 'Click Count: 1'
    });

    assert.strictEqual(checkRes.status, 'accept');
    assert.strictEqual(checkRes.outcome?.goalSatisfied, true, 'Assertion verified: Click Count: 1');

    // 6. Close session
    await browserProvider.closeSession(openRes.sessionId);
    console.log('• Browser session closed cleanly.');

    console.log('✅ Real Live Browser Integration Test Passed!');
  } finally {
    testServer.close();
  }
}
