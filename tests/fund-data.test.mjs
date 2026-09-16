import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeValuation, normalizeTencent, fetchQuote, fetchTiantianQuote } from '../app/api/fund-quotes.js';
import { getHoldingProfit } from '../app/lib/holding-profit.js';
import { parseHoldings } from '../app/api/holdings-parser.js';

const code = '024418';
const row = { FCODE: code, SHORTNAME: '测试基金', NAV: 2, PDATE: '2026-09-15', GSZ: '2.1', GSZZL: '5', GZTIME: '2026-09-16 11:30' };
const official = normalizeTencent(`${code}~测试基金~~~~2~2~1.2~2026-09-15~`, code);
const rejected = async () => { throw new Error('source unavailable'); };

test('current valuation uses numeric fields, including zero change', () => {
  const result = normalizeValuation({ ...row, GSZZL: 0 }, code);
  assert.equal(result.noValuation, false);
  assert.equal(result.gszzl, 0);
  assert.equal(result.gsz, 2.1);
});

test('null, blank, invalid or undated estimates fall back to NAV, never a fake zero', () => {
  for (const invalid of [{ GSZ: null }, { GSZ: '' }, { GSZZL: null }, { GSZZL: '' }, { GSZZL: 'NaN' }, { GZTIME: null }]) {
    const result = normalizeValuation({ ...row, ...invalid }, code);
    assert.equal(result.noValuation, true);
    assert.equal(result.gsz, null);
    assert.equal(result.gszzl, null);
    assert.equal(result.dwjz, 2);
  }
});

test('reject mismatched codes and invalid NAVs', () => {
  assert.throws(() => normalizeValuation({ ...row, FCODE: '110022' }, code));
  assert.throws(() => normalizeValuation({ ...row, NAV: 0 }, code));
  assert.throws(() => normalizeTencent('v_pv_none_match=1', code));
  assert.throws(() => normalizeTencent('110022~wrong~~~~2~2~1~2026-09-15~', code));
});

test('primary failure uses independent published NAV', async () => {
  const result = await fetchQuote(code, rejected, async () => official);
  assert.equal(result.source, 'tencent');
  assert.equal(result.noValuation, true);
  assert.equal(result.zzl, 1.2);
});

test('backup failure does not discard a successful primary quote', async () => {
  const result = await fetchQuote(code, async () => normalizeValuation(row, code), rejected);
  assert.equal(result.gsz, 2.1);
  assert.equal(result.zzl, null);
});

test('both failures reject; the next refresh can recover', async () => {
  await assert.rejects(fetchQuote(code, rejected, rejected), /均获取失败/);
  assert.equal((await fetchQuote(code, async () => normalizeValuation(row, code), rejected)).gsz, 2.1);
});

test('malformed and empty primary responses really trigger fallback', async t => {
  for (const payload of [{ success: false }, { success: true, data: [] }, { success: true, data: [{ ...row, NAV: null }] }]) {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }));
    assert.equal((await fetchQuote(code, fetchTiantianQuote, async () => official)).source, 'tencent');
    t.mock.restoreAll();
  }
});

test('a newer NAV invalidates an older valuation', async () => {
  const result = await fetchQuote(code, async () => normalizeValuation(row, code), async () => ({ ...official, jzrq: '2026-09-17', dwjz: 2.3 }));
  assert.equal(result.dwjz, 2.3);
  assert.equal(result.gsz, null);
  assert.equal(result.noValuation, true);
});

test('an older backup NAV cannot overwrite a newer primary NAV', async () => {
  const result = await fetchQuote(code, async () => normalizeValuation(row, code), async () => ({ ...official, jzrq: '2026-09-14', dwjz: 1.8 }));
  assert.equal(result.dwjz, 2);
  assert.equal(result.zzl, null);
});

const holding = { share: 100, cost: 1.8 };
const context = { today: '2026-09-16', useValuation: true };
test('today estimate determines current amount and profit, even for legacy string prices', () => {
  const result = getHoldingProfit({ ...normalizeValuation(row, code), gsz: '2.1' }, holding, context);
  assert.equal(result.amount, 210);
  assert.ok(Math.abs(result.profitToday - 10) < 1e-9);
});

test('stale, missing and failed estimates use published NAV without inventing today profit', () => {
  for (const fields of [{ gztime: '2026-09-15 15:00' }, { refreshError: true }, { noValuation: true }, { gsz: null }]) {
    const result = getHoldingProfit({ ...normalizeValuation(row, code), ...fields }, holding, context);
    assert.equal(result.amount, 200);
    assert.equal(result.profitToday, null);
  }
});

test('today confirmed NAV wins; unknown daily change is not 0%', () => {
  const fund = { ...normalizeValuation(row, code), jzrq: context.today, zzl: null };
  const result = getHoldingProfit(fund, holding, context);
  assert.equal(result.amount, 200);
  assert.equal(result.profitToday, null);
  assert.equal(getHoldingProfit({ ...fund, zzl: 0 }, holding, context).profitToday, 0);
});

test('holdings parser preserves five-digit HK codes and ignores empty tables', () => {
  const html = '<table><thead><tr><th>股票代码</th><th>股票名称</th><th>占净值比例</th></tr></thead><tbody><tr><td>00700</td><td>腾讯控股</td><td>9.20%</td></tr></tbody></table>';
  assert.deepEqual(parseHoldings(html), [{ code: '00700', name: '腾讯控股', weight: '9.20%', change: null }]);
  assert.deepEqual(parseHoldings('<p>暂无数据</p>'), []);
});
