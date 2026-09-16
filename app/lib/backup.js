const keys = ['funds', 'favorites', 'groups', 'collapsedCodes', 'refreshMs', 'viewMode', 'holdings', 'pendingTrades'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const codeValid = value => typeof value === 'string' && /^\d{6}$/.test(value);
const fail = message => { throw new Error(message); };
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const unique = values => [...new Set(values)];

export function validateBackup(input) {
  if (!object(input) || !Array.isArray(input.funds)) fail('不是有效的基金备份：缺少基金列表');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail('不支持此备份版本');
  if (input.app !== undefined && input.app !== 'fund-baby') fail('不是本应用的备份文件');
  if (input.funds.length > 2000) fail('基金数量超过限制');
  const funds = input.funds.map(fund => {
    if (!object(fund) || !codeValid(fund.code) || typeof fund.name !== 'string') fail('基金代码或名称无效');
    // Market caches are not trusted portfolio data. Import identifiers and the
    // last published NAV only; refresh rebuilds holdings/history/estimates.
    return { code: fund.code, name: fund.name,
      dwjz: Number.isFinite(Number(fund.dwjz)) && Number(fund.dwjz) > 0 ? Number(fund.dwjz) : null,
      jzrq: /^\d{4}-\d{2}-\d{2}$/.test(fund.jzrq || '') ? fund.jzrq : '',
      noValuation: true, gsz: null, gszzl: null, zzl: null,
      holdings: [], historyTrend: [], refreshError: true };
  });
  const codes = new Set(funds.map(f => f.code));
  if (codes.size !== funds.length) fail('基金列表含重复代码');
  const codeList = (value = []) => {
    if (!Array.isArray(value) || value.some(c => !codes.has(c))) fail('自选或分组引用了不存在的基金');
    return unique(value);
  };
  const groups = input.groups ?? [];
  if (!Array.isArray(groups)) fail('分组格式无效');
  const normalizedGroups = groups.map(group => {
    if (!object(group) || typeof group.id !== 'string' || !group.id || typeof group.name !== 'string') fail('分组格式无效');
    return { id: group.id, name: group.name, codes: codeList(group.codes) };
  });
  if (new Set(groups.map(g => g.id)).size !== groups.length) fail('分组编号重复');
  const holdings = input.holdings ?? {};
  if (!object(holdings)) fail('持仓格式无效');
  const normalizedHoldings = {};
  for (const [code, holding] of Object.entries(holdings)) {
    if (!codes.has(code) || !object(holding) || !numeric(holding.share) || holding.share < 0 || !numeric(holding.cost)) fail('持仓份额或成本无效');
    normalizedHoldings[code] = { share: holding.share, cost: holding.cost };
  }
  const pending = input.pendingTrades ?? [];
  if (!Array.isArray(pending)) fail('待处理交易格式无效');
  const pendingTrades = pending.map(trade => {
    if (!object(trade) || !codes.has(trade.fundCode) || !['buy', 'sell'].includes(trade.type)) fail('待处理交易无效');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trade.date || '') || new Date(trade.date).toISOString().slice(0, 10) !== trade.date) fail('交易日期无效');
    const amount = trade.type === 'buy' ? trade.amount : trade.share;
    if (!numeric(amount) || amount <= 0) fail('交易金额或份额无效');
    if (trade.feeRate != null && (!numeric(trade.feeRate) || trade.feeRate < 0)) fail('交易费率无效');
    if (trade.isAfter3pm != null && typeof trade.isAfter3pm !== 'boolean') fail('交易时间格式无效');
    if (trade.id != null && (typeof trade.id !== 'string' || !trade.id)) fail('交易编号无效');
    return { ...trade, id: trade.id || `legacy:${trade.fundCode}:${trade.type}:${trade.date}:${amount}:${!!trade.isAfter3pm}` };
  });
  if (new Set(pendingTrades.map(t => t.id)).size !== pendingTrades.length) fail('待处理交易编号重复');
  const refreshMs = input.refreshMs ?? 30000;
  if (!numeric(refreshMs) || refreshMs < 5000 || refreshMs > 86400000) fail('刷新频率无效');
  const viewMode = input.viewMode ?? 'card';
  if (!['card', 'list'].includes(viewMode)) fail('显示模式无效');
  return { funds, favorites: codeList(input.favorites), groups: normalizedGroups,
    collapsedCodes: codeList(input.collapsedCodes), holdings: normalizedHoldings,
    pendingTrades, refreshMs: Math.max(10000, refreshMs), viewMode,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : null };
}

export function readBackup(storage) {
  const defaults = { funds: [], favorites: [], groups: [], collapsedCodes: [], holdings: {}, pendingTrades: [], refreshMs: 30000, viewMode: 'card' };
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) defaults[key] = key === 'viewMode' ? value : JSON.parse(value);
  }
  return validateBackup(defaults);
}

export function serializeBackup(data) {
  return JSON.stringify({ ...validateBackup(data), app: 'fund-baby', schemaVersion: 1, exportedAt: new Date().toISOString() }, null, 2);
}

export function findConflicts(local, incoming) {
  const holdingCodes = Object.keys(incoming.holdings).filter(code => local.holdings[code] &&
    (local.holdings[code].share !== incoming.holdings[code].share || local.holdings[code].cost !== incoming.holdings[code].cost));
  const tradeIds = incoming.pendingTrades.filter(trade => {
    const prior = local.pendingTrades.find(t => t.id === trade.id);
    return prior && JSON.stringify(prior) !== JSON.stringify(trade);
  }).map(t => t.id);
  return { holdingCodes, tradeIds };
}

export function planImport(local, incoming, mode, conflicts = 'local') {
  if (mode === 'replace') return validateBackup(incoming);
  if (mode !== 'merge' || !['local', 'file'].includes(conflicts)) fail('请选择有效的导入方式');
  const funds = [...local.funds, ...incoming.funds.filter(f => !local.funds.some(p => p.code === f.code))];
  const groups = local.groups.map(g => ({ ...g, codes: [...g.codes] }));
  incoming.groups.forEach(g => {
    const found = groups.find(p => p.id === g.id);
    if (found) found.codes = unique([...found.codes, ...g.codes]);
    else groups.push(g);
  });
  const trades = new Map(local.pendingTrades.map(t => [t.id, t]));
  incoming.pendingTrades.forEach(t => { if (!trades.has(t.id) || conflicts === 'file') trades.set(t.id, t); });
  return validateBackup({ ...local, funds, groups,
    favorites: unique([...local.favorites, ...incoming.favorites]),
    collapsedCodes: unique([...local.collapsedCodes, ...incoming.collapsedCodes]),
    holdings: conflicts === 'file' ? { ...local.holdings, ...incoming.holdings } : { ...incoming.holdings, ...local.holdings },
    pendingTrades: [...trades.values()] });
}

// Validate and serialize everything before the first write. Roll back all keys
// if a storage write fails; never clear unrelated browser data.
export function commitBackup(storage, data) {
  const valid = validateBackup(data);
  const entries = keys.map(key => [key, key === 'viewMode' ? valid[key] : JSON.stringify(valid[key])]);
  const previous = keys.map(key => [key, storage.getItem(key)]);
  try {
    for (const [key, value] of entries) storage.setItem(key, value);
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    throw error;
  }
  return valid;
}
