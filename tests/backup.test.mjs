import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, serializeBackup, readBackup, findConflicts, planImport, commitBackup } from '../app/lib/backup.js';
const make = (code = '024418', share = 10) => validateBackup({ funds: [{ code, name: '测试基金' }], holdings: { [code]: { share, cost: 2 } } });
const storage = () => {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
};
test('versioned backup round trip preserves all portfolio fields', () => {
  const data = make();
  data.groups = [{ id: 'g1', name: '分组', codes: ['024418'] }];
  data.favorites = ['024418'];
  data.pendingTrades = [{ id: 't1', fundCode: '024418', type: 'buy', amount: 100, date: '2026-09-16', feeRate: 0, isAfter3pm: false }];
  const json = JSON.parse(serializeBackup(data));
  assert.equal(json.schemaVersion, 1);
  const result = validateBackup(json);
  for (const key of ['funds', 'holdings', 'groups', 'favorites', 'pendingTrades']) assert.deepEqual(result[key], data[key]);
});
test('legacy files work; arbitrary JSON and future formats are rejected', () => {
  assert.equal(make().funds.length, 1);
  for (const invalid of [{}, [], null, { funds: [], schemaVersion: 2 }, { funds: [], app: 'other' }]) assert.throws(() => validateBackup(invalid));
});
test('malformed holdings, fund links and transactions are rejected', () => {
  const data = make();
  for (const invalid of [
    { ...data, holdings: { '024418': { share: -1, cost: 2 } } },
    { ...data, holdings: { '024418': { share: '10', cost: 2 } } },
    { ...data, favorites: ['110022'] },
    { ...data, groups: [{ id: 'x', name: 'x', codes: ['110022'] }] },
    { ...data, pendingTrades: [{ fundCode: '024418', type: 'buy', amount: -1, date: '2026-09-16' }] },
  ]) assert.throws(() => validateBackup(invalid));
});
test('untrusted market cache shapes cannot enter the UI', () => {
  const data = validateBackup({ funds: [{ code: '024418', name: '测试', holdings: 'bad', historyTrend: {}, gsz: 999 }] });
  assert.deepEqual(data.funds[0].holdings, []);
  assert.equal(data.funds[0].gsz, null);
});
test('merge keeps local conflicts by default; explicit choice uses file', () => {
  const local = make();
  const incoming = make('024418', 99);
  assert.deepEqual(findConflicts(local, incoming).holdingCodes, ['024418']);
  assert.equal(planImport(local, incoming, 'merge').holdings['024418'].share, 10);
  assert.equal(planImport(local, incoming, 'merge', 'file').holdings['024418'].share, 99);
});
test('merge is idempotent and preserves local settings', () => {
  const local = make(); const incoming = make('110022');
  incoming.viewMode = 'list'; incoming.favorites = ['110022'];
  incoming.pendingTrades = [{ id: 't', fundCode: '110022', type: 'sell', share: 1, date: '2026-09-16' }];
  const merged = planImport(local, incoming, 'merge');
  assert.equal(merged.viewMode, 'card');
  assert.equal(merged.funds.length, 2);
  assert.deepEqual(planImport(merged, incoming, 'merge'), merged);
});
test('replacement removes old portfolio entries and includes file settings', () => {
  const incoming = make('110022'); incoming.viewMode = 'list';
  const result = planImport(make(), incoming, 'replace');
  assert.equal(result.funds.length, 1);
  assert.equal(result.holdings['024418'], undefined);
  assert.equal(result.viewMode, 'list');
});
test('storage failure restores prior data, leaving unrelated keys intact', () => {
  const store = storage(); commitBackup(store, make()); store.setItem('theme', 'light');
  const before = new Map(store.values);
  const write = store.setItem;
  let count = 0;
  store.setItem = (key, value) => { if (++count === 3) throw new Error('quota'); write(key,value); };
  assert.throws(() => commitBackup(store, make('110022')), /quota/);
  assert.deepEqual(store.values, before);
});
test('validation failure never writes; successful data persists across reads', () => {
  const store = storage();
  assert.throws(() => commitBackup(store, {})); assert.equal(store.values.size, 0);
  commitBackup(store, make()); assert.deepEqual(readBackup(store), make());
});
