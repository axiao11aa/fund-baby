export function parseHoldings(html) {
  const holdings = [];
  const headerRow = (html.match(/<thead[\s\S]*?<tr[\s\S]*?<\/tr>[\s\S]*?<\/thead>/i) || [])[0] || '';
  const headerCells = (headerRow.match(/<th[\s\S]*?>([\s\S]*?)<\/th>/gi) || []).map(th => th.replace(/<[^>]*>/g, '').trim());
  let idxCode = -1, idxName = -1, idxWeight = -1;
  headerCells.forEach((h, i) => {
    const t = h.replace(/\s+/g, '');
    if (idxCode < 0 && (t.includes('股票代码') || t.includes('证券代码'))) idxCode = i;
    if (idxName < 0 && (t.includes('股票名称') || t.includes('证券名称'))) idxName = i;
    if (idxWeight < 0 && (t.includes('占净值比例') || t.includes('占比'))) idxWeight = i;
  });
  const rows = html.match(/<tbody[\s\S]*?<\/tbody>/i) || [];
  const dataRows = rows.length ? rows[0].match(/<tr[\s\S]*?<\/tr>/gi) || [] : html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const r of dataRows) {
    const tds = (r.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]*>/g, '').trim());
    if (!tds.length) continue;
    let code = '';
    let name = '';
    let weight = '';
    if (idxCode >= 0 && tds[idxCode]) {
      const m = tds[idxCode].match(/(\d{5,6})/);
      code = m ? m[1] : tds[idxCode];
    } else {
      const codeIdx = tds.findIndex(txt => /^\d{5,6}$/.test(txt));
      if (codeIdx >= 0) code = tds[codeIdx];
    }
    if (idxName >= 0 && tds[idxName]) {
      name = tds[idxName];
    } else if (code) {
      const i = tds.findIndex(txt => txt && txt !== code && !/%$/.test(txt));
      name = i >= 0 ? tds[i] : '';
    }
    if (idxWeight >= 0 && tds[idxWeight]) {
      const wm = tds[idxWeight].match(/([\d.]+)\s*%/);
      weight = wm ? `${wm[1]}%` : tds[idxWeight];
    } else {
      const wIdx = tds.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt));
      weight = wIdx >= 0 ? tds[wIdx].match(/([\d.]+)\s*%/)?.[1] + '%' : '';
    }
    if (code && name && weight) {
      holdings.push({ code, name, weight, change: null });
    }
  }
  return holdings.slice(0, 10);
}
