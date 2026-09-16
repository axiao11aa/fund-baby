import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, loadScript, readGlobalScript, fetchJsonp } from '../app/api/browser-requests.js';

function browser(t, onAppend) {
  const scripts = new Set();
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  globalThis.window = {};
  globalThis.document = {
    createElement: () => ({ remove() { scripts.delete(this); } }),
    body: { appendChild(script) { scripts.add(script); onAppend?.(script); } },
  };
  return scripts;
}

test('hung fetch settles and aborts without blocking fallback', async t => {
  let signal;
  t.mock.method(globalThis, 'fetch', (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  await assert.rejects(fetchJson('https://example.test/data', 10), /超时/);
  assert.equal(signal.aborted, true);
});

test('HTTP errors, invalid JSON, and hung bodies all settle', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(fetchJson('https://example.test/data'), /503/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json() { throw new Error('invalid JSON'); } }));
  await assert.rejects(fetchJson('https://example.test/data'), /invalid JSON/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: () => new Promise(() => {}) }));
  await assert.rejects(fetchJson('https://example.test/data', 10), /超时/);
});

test('hung script rejects and is removed', async t => {
  const scripts = browser(t);
  await assert.rejects(loadScript('https://example.test/script', undefined, 10), /超时/);
  assert.equal(scripts.size, 0);
});

test('script HTTP errors reject and clean up', async t => {
  const scripts = browser(t, script => queueMicrotask(() => script.onerror()));
  await assert.rejects(loadScript('https://example.test/script'), /加载失败/);
  assert.equal(scripts.size, 0);
});

test('JSONP onload without callback rejects rather than hanging', async t => {
  const scripts = browser(t, script => queueMicrotask(() => script.onload()));
  await assert.rejects(fetchJsonp('https://example.test/jsonp?a=1'), /有效数据/);
  assert.equal(scripts.size, 0);
  assert.deepEqual(Object.keys(window), []);
});

test('concurrent JSONP calls have distinct callbacks and clean up', async t => {
  const names = [];
  browser(t, script => queueMicrotask(() => {
    const url = new URL(script.src);
    const callback = url.searchParams.get('callback');
    names.push(callback);
    window[callback](url.searchParams.get('id'));
    script.onload();
  }));
  assert.deepEqual(await Promise.all([fetchJsonp('https://example.test/?id=a'), fetchJsonp('https://example.test/?id=b')]), ['a', 'b']);
  assert.equal(new Set(names).size, 2);
  assert.deepEqual(Object.keys(window), []);
});

test('shared script globals cannot mix concurrent funds or reuse old data', async t => {
  let active = 0;
  let maxActive = 0;
  browser(t, script => {
    active++;
    maxActive = Math.max(maxActive, active);
    setTimeout(() => {
      if (!script.src.endsWith('empty')) window.apidata = script.src;
      active--;
      script.onload();
    }, 2);
  });
  const values = await Promise.all([readGlobalScript('fund-a', 'apidata'), readGlobalScript('fund-b', 'apidata')]);
  assert.deepEqual(values, ['fund-a', 'fund-b']);
  assert.equal(maxActive, 1);
  window.apidata = 'stale fund';
  await assert.rejects(readGlobalScript('empty', 'apidata'), /有效数据/);
  assert.equal(window.apidata, undefined);
  assert.equal(await readGlobalScript('recovered', 'apidata'), 'recovered');
});
