// CDP framing and client over --remote-debugging-pipe (lib/cdp-pipe.mjs, spec §11.1, §16.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createFrameReader, encodeMessage, createCdpClient, CdpError, CdpTimeout, CdpClosed } from '../lib/cdp-pipe.mjs';

function collect() {
  const got = [];
  const errors = [];
  const push = createFrameReader((m) => got.push(m), (e) => errors.push(e));
  return { got, errors, push };
}

test('framing: one message split across two reads', () => {
  const { got, push } = collect();
  const buf = encodeMessage({ id: 1, result: { a: 'x' } });
  push(buf.subarray(0, 5));
  assert.deepEqual(got, []);
  push(buf.subarray(5));
  assert.deepEqual(got, [{ id: 1, result: { a: 'x' } }]);
});

test('framing: several messages in one read', () => {
  const { got, push } = collect();
  push(Buffer.concat([encodeMessage({ id: 1 }), encodeMessage({ id: 2 }), encodeMessage({ method: 'Page.loadEventFired' })]));
  assert.deepEqual(got.map((m) => m.id ?? m.method), [1, 2, 'Page.loadEventFired']);
});

test('framing: UTF-8 character split between two reads is not broken', () => {
  const { got, push } = collect();
  const buf = encodeMessage({ id: 3, result: { title: 'Título ñandú — á é' } });
  const cut = buf.indexOf(Buffer.from('ñ')) + 1; // inside the two bytes of ñ
  push(buf.subarray(0, cut));
  push(buf.subarray(cut));
  assert.equal(got[0].result.title, 'Título ñandú — á é');
});

test('framing: invalid JSON is reported, the next message still arrives', () => {
  const { got, errors, push } = collect();
  push(Buffer.concat([Buffer.from('{nope\0'), encodeMessage({ id: 4 })]));
  assert.equal(errors.length, 1);
  assert.deepEqual(got, [{ id: 4 }]);
});

function fakeBrowser() {
  const toBrowser = new PassThrough();
  const fromBrowser = new PassThrough();
  const sent = [];
  const read = createFrameReader((m) => sent.push(m));
  toBrowser.on('data', read);
  const reply = (obj) => fromBrowser.write(encodeMessage(obj));
  return { toBrowser, fromBrowser, sent, reply };
}
const tick = () => new Promise((r) => setImmediate(r));

test('client: a response resolves its request; sessionId travels with it', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Runtime.evaluate', { expression: '1' }, { sessionId: 'S1' });
  await tick();
  assert.deepEqual(b.sent[0], { id: 1, method: 'Runtime.evaluate', params: { expression: '1' }, sessionId: 'S1' });
  b.reply({ id: 1, result: { result: { value: 1 } }, sessionId: 'S1' });
  assert.deepEqual(await p, { result: { value: 1 } });
});

test('client: a CDP error rejects with CdpError', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Page.navigate', { url: 'x' });
  await tick();
  b.reply({ id: 1, error: { code: -32000, message: 'Cannot navigate to invalid URL' } });
  await assert.rejects(p, (e) => e instanceof CdpError && e.code === -32000 && /Page\.navigate: Cannot navigate/.test(e.message));
});

test('client: a request without answer times out and is forgotten', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  await assert.rejects(cdp.send('Browser.getVersion', {}, { timeoutMs: 20 }), (e) => e instanceof CdpTimeout && /Browser\.getVersion/.test(e.message));
  assert.equal(cdp.pendingCount(), 0);
});

test('client: the pipe closing rejects what is pending', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Browser.getVersion');
  await tick();
  b.fromBrowser.end();
  await assert.rejects(p, CdpClosed);
  await assert.rejects(cdp.send('Browser.getVersion'), CdpClosed);
});

test('client: waitFor resolves on the first matching event of the session', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.waitFor('Page.loadEventFired', { sessionId: 'S1', timeoutMs: 1000 });
  b.reply({ method: 'Page.loadEventFired', params: { timestamp: 1 }, sessionId: 'S2' });
  b.reply({ method: 'Page.loadEventFired', params: { timestamp: 2 }, sessionId: 'S1' });
  assert.deepEqual(await p, { timestamp: 2 });
  await assert.rejects(cdp.waitFor('Page.frameNavigated', { timeoutMs: 20 }), CdpTimeout);
});
