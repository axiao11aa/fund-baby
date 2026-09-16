import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const TZ = 'Asia/Shanghai';
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());

import { readGlobalScript, fetchJsonp } from './browser-requests.js';
import { fetchQuote, fetchTencentQuote } from './fund-quotes.js';
import { fetchHoldings, fetchHoldingQuotes, fetchHistory } from './fund-details.js';
export { loadScript } from './browser-requests.js';

export const fetchFundNetValue = async (code, date) => {
  if (typeof window === 'undefined') return null;
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1&sdate=${date}&edate=${date}`;
  try {
    const data = await readGlobalScript(url, 'apidata');
    if (data && data.content) {
      const content = data.content;
      if (content.includes('暂无数据')) return null;
      const rows = content.split('<tr>');
      for (const row of rows) {
        if (row.includes(`<td>${date}</td>`)) {
          const cells = row.match(/<td[^>]*>(.*?)<\/td>/g);
          if (cells && cells.length >= 2) {
            const valStr = cells[1].replace(/<[^>]+>/g, '');
            const val = parseFloat(valStr);
            return isNaN(val) ? null : val;
          }
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const fetchSmartFundNetValue = async (code, startDate) => {
  const today = nowInTz().startOf('day');
  let current = toTz(startDate).startOf('day');
  for (let i = 0; i < 30; i++) {
    if (current.isAfter(today)) break;
    const dateStr = current.format('YYYY-MM-DD');
    const val = await fetchFundNetValue(code, dateStr);
    if (val !== null) {
      return { date: dateStr, value: val };
    }
    current = current.add(1, 'day');
  }
  return null;
};

export const fetchFundDataFallback = fetchTencentQuote;

export const fetchFundData = async (code) => {
  const quote = await fetchQuote(code);
  const [holdingsResult, historyResult] = await Promise.allSettled([
    fetchHoldings(code).then(fetchHoldingQuotes),
    fetchHistory(code),
  ]);
  const historyTrend = historyResult.status === 'fulfilled' ? historyResult.value : [];
  const latestOfficial = historyTrend.find(point =>
    dayjs(point.x).tz(TZ).format('YYYY-MM-DD') === quote.jzrq);
  if (quote.zzl === null && Number.isFinite(latestOfficial?.equityReturn)) {
    quote.zzl = latestOfficial.equityReturn;
  }
  const previous = historyTrend.filter(point =>
    dayjs(point.x).tz(TZ).format('YYYY-MM-DD') < nowInTz().format('YYYY-MM-DD')).at(-1);
  return {
    ...quote,
    holdings: holdingsResult.status === 'fulfilled' ? holdingsResult.value : [],
    historyTrend, yesterdayChange: previous?.equityReturn ?? null,
    fetchedAt: new Date().toISOString(), refreshError: false,
  };
};

export const searchFunds = async (value) => {
  if (!value.trim()) return [];
  const data = await fetchJsonp(`https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(value)}&_=${Date.now()}`);
  return (Array.isArray(data?.Datas) ? data.Datas : []).filter(row =>
    String(row.CATEGORY) === '700' || row.CATEGORYDESC === '基金');
};

export const fetchShanghaiIndexDate = async () => {
  const text = await readGlobalScript(`https://qt.gtimg.cn/q=sh000001&_=${Date.now()}`, 'v_sh000001');
  const date = String(text).split('~')[30]?.slice(0, 8);
  return /^\d{8}$/.test(date || '') ? date : null;
};

export const fetchLatestRelease = async () => null;

// The old intraday provider is offline. The replacement returns only the latest
// point, not a series. Do not invent a curve from that single estimate.
export const fetchIntradayData = async () => null;

export const submitFeedback = async (formData) => {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: formData
  });
  return response.json();
};
