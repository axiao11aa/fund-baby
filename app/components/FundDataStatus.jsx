export default function FundDataStatus({ fund, today }) {
  const message = fund.refreshError ? '更新失败 · 显示上次数据'
    : fund.noValuation ? '暂无盘中估值 · 显示已公布净值'
    : fund.gztime?.slice(0, 10) !== today ? '估值非今日 · 请留意日期' : null;
  return message ? <span className="muted" role="status" style={{ display: 'block', fontSize: 11 }}>{message}</span> : null;
}
