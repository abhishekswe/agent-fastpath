import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SSRFBlockedError } from '@agent-fastpath/core';
import { assertNavigationAllowed, BrowserSafety, isNonPublicAddress } from '@agent-fastpath/provider-browser';

const publicOnly = { allowedOrigins: [], allowPrivateNetworks: false };

test('classifies loopback, private, link-local, and mapped addresses as non-public', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '[::1]', '::', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe'
  ]) {
    assert.ok(isNonPublicAddress(ip), ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.ok(!isNonPublicAddress(ip), ip);
  }
});

test('blocks navigation to private targets, including IPv6 and encoded forms', async () => {
  for (const url of [
    'http://127.0.0.1:8080/admin',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://localhost/',
    'http://app.localhost/',
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd'
  ]) {
    await assert.rejects(assertNavigationAllowed(url, publicOnly), SSRFBlockedError, url);
  }
});

test('blocks hostnames whose DNS answer is private (rebinding-style)', async () => {
  const lookup = async () => ['93.184.216.34', '10.0.0.5'];
  await assert.rejects(assertNavigationAllowed('https://mixed.test/', publicOnly, lookup), SSRFBlockedError);
});

test('enforces the origin allowlist, with wildcard subdomains', async () => {
  const lookup = async () => ['93.184.216.34'];
  const limits = { allowedOrigins: ['https://example.com', '*.example.org'], allowPrivateNetworks: false };
  await assertNavigationAllowed('https://example.com/checkout', limits, lookup);
  await assertNavigationAllowed('https://docs.example.org/', limits, lookup);
  await assert.rejects(assertNavigationAllowed('https://evil.com/', limits, lookup), SSRFBlockedError);
  await assert.rejects(assertNavigationAllowed('https://notexample.org/', limits, lookup), SSRFBlockedError);
});

test('flags irreversible labels without flagging look-alikes', () => {
  const el = (label: string) => ({ ref: 'r', index: 1, tagName: 'BUTTON', label });
  for (const label of ['Delete Project', 'Buy Now', 'Place order', 'Pay now', 'Cancel subscription']) {
    assert.ok(BrowserSafety.isIrreversible('click', el(label)), label);
  }
  for (const label of ['View Profile', 'Dropdown menu', 'Display settings', 'Learn more']) {
    assert.ok(!BrowserSafety.isIrreversible('click', el(label)), label);
  }
  assert.ok(!BrowserSafety.isIrreversible('type', el('Delete')), 'typing is never irreversible');
});
