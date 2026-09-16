import { numberOrNull } from './fund-values.js';

export function getHoldingProfit(fund, holding, { today, useValuation }) {
  if (!holding || !Number.isFinite(holding.share)) return null;
  const hasTodayNav = fund.jzrq === today;
  const hasTodayEstimate = !fund.noValuation && !fund.refreshError &&
    typeof fund.gztime === 'string' && fund.gztime.startsWith(today);
  const estimate = numberOrNull(fund.gsz);
  const useEstimate = useValuation && !hasTodayNav && hasTodayEstimate && estimate > 0;
  const currentNav = useEstimate ? estimate : numberOrNull(fund.dwjz);
  if (!(currentNav > 0)) return null;
  const amount = holding.share * currentNav;
  const rate = numberOrNull(useEstimate ? fund.gszzl : fund.zzl);
  const hasTodayPrice = useEstimate || hasTodayNav;
  const profitToday = hasTodayPrice && !fund.refreshError && rate !== null && rate > -100
    ? amount - amount / (1 + rate / 100) : null;
  return {
    amount, profitToday,
    profitTotal: Number.isFinite(holding.cost) ? (currentNav - holding.cost) * holding.share : null,
  };
}
