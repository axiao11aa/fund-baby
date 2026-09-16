import { fetchJson, readGlobalScript } from './browser-requests.js';
import { numberOrNull } from '../lib/fund-values.js';

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

export function normalizeValuation(row, code) {
  if (!row || row.FCODE !== code) throw new Error('未找到基金数据');
  const nav = numberOrNull(row.NAV);
  if (!(nav > 0) || !validDate(row.PDATE)) throw new Error('基金净值数据无效');
  const valuation = numberOrNull(row.GSZ);
  const change = numberOrNull(row.GSZZL);
  const time = typeof row.GZTIME === 'string' ? row.GZTIME : '';
  const hasValuation = valuation > 0 && change !== null &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(time) && time.slice(0, 10) >= row.PDATE;
  return {
    code, name: row.SHORTNAME || code, dwjz: nav, jzrq: row.PDATE,
    gsz: hasValuation ? valuation : null,
    gszzl: hasValuation ? change : null,
    gztime: hasValuation ? time : null,
    zzl: null, noValuation: !hasValuation, source: 'tiantian',
  };
}

export function normalizeTencent(text, code) {
  const parts = String(text).split('~');
  const nav = numberOrNull(parts[5]);
  const date = (parts[8] || '').slice(0, 10);
  if (parts[0] !== code || !(nav > 0) || !validDate(date)) {
    throw new Error('备用源未返回有效净值');
  }
  return {
    code, name: parts[1] || code, dwjz: nav, jzrq: date,
    zzl: numberOrNull(parts[7]), gsz: null, gszzl: null, gztime: null,
    noValuation: true, source: 'tencent',
  };
}

export async function fetchTiantianQuote(code) {
  const fields = 'FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE';
  const result = await fetchJson(`https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast?FCODES=${code}&FIELDS=${fields}&_=${Date.now()}`);
  if (!result.success || !Array.isArray(result.data)) throw new Error('估值接口不可用');
  return normalizeValuation(result.data.find(row => row.FCODE === code), code);
}

export async function fetchTencentQuote(code) {
  const text = await readGlobalScript(`https://qt.gtimg.cn/q=jj${code}&_=${Date.now()}`, `v_jj${code}`);
  return normalizeTencent(text, code);
}

// Fetch the published NAV independently: an estimate failure must never prevent
// fallback, and a NAV-source failure must never discard a valid estimate.
export async function fetchQuote(code, primary = fetchTiantianQuote, backup = fetchTencentQuote) {
  if (!/^\d{6}$/.test(code)) throw new Error('基金代码应为六位数字');
  const [estimate, official] = await Promise.allSettled([
    Promise.resolve().then(() => primary(code)),
    Promise.resolve().then(() => backup(code)),
  ]);
  if (estimate.status === 'rejected') {
    if (official.status === 'fulfilled') return official.value;
    throw new Error('估值和备用净值均获取失败，请稍后重试');
  }
  const quote = { ...estimate.value };
  if (official.status === 'fulfilled' && official.value.jzrq >= quote.jzrq) {
    quote.dwjz = official.value.dwjz;
    quote.jzrq = official.value.jzrq;
    quote.zzl = official.value.zzl;
    if (quote.gztime && quote.gztime.slice(0, 10) < quote.jzrq) {
      quote.gsz = quote.gszzl = quote.gztime = null;
      quote.noValuation = true;
    }
  }
  return quote;
}
