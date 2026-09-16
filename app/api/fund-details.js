import { readGlobalScript } from './browser-requests.js';
import { numberOrNull } from '../lib/fund-values.js';
import { parseHoldings } from './holdings-parser.js';

// Share successful disclosure/history reads for five minutes. Failed reads
// are evicted so the next refresh can retry immediately.
const detailsCache = new Map();
function cached(key, load) {
  const entry = detailsCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  const promise = load().catch(error => { detailsCache.delete(key); throw error; });
  detailsCache.set(key, { promise, expires: Date.now() + 5 * 60 * 1000 });
  return promise;
}

export async function fetchHoldings(code) {
  return cached(`holdings:${code}`, async () => {
    const data = await readGlobalScript(`https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=&month=&_=${Date.now()}`, 'apidata');
    return parseHoldings(data.content || '');
  });
}

export async function fetchHistory(code) {
  return cached(`history:${code}`, async () => {
    const data = await readGlobalScript(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, 'Data_netWorthTrend');
    if (!Array.isArray(data)) throw new Error('历史净值无效');
    return data.slice(-90).map(({ x, y, equityReturn }) => ({ x, y, equityReturn }));
  });
}

export async function fetchHoldingQuotes(holdings) {
  return Promise.all(holdings.map(async holding => {
    const code = String(holding.code);
    const market = /^\d{5}$/.test(code) ? 'hk'
      : /^[69]/.test(code) ? 'sh' : /^[48]/.test(code) ? 'bj' : 'sz';
    if (!/^\d{5,6}$/.test(code)) return holding;
    const symbol = `s_${market}${code}`;
    try {
      const text = await readGlobalScript(`https://qt.gtimg.cn/q=${symbol}&_=${Date.now()}`, `v_${symbol}`);
      return { ...holding, change: numberOrNull(String(text).split('~')[5]) };
    } catch {
      return { ...holding, change: null };
    }
  }));
}
