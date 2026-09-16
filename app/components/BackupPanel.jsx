'use client';
import { useState, useRef } from 'react';
import { readBackup, validateBackup, serializeBackup, findConflicts, planImport, commitBackup } from '../lib/backup.js';

async function download(data) {
  const text = serializeBackup(data);
  const name = `fund-baby-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const blob = new Blob([text], { type: 'application/json' });
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '基金备份', accept: { 'application/json': ['.json'] } }] });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export default function BackupPanel({ onApplied, busy }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('merge');
  const [choice, setChoice] = useState('local');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [reading, setReading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const exportData = async () => {
    setWorking(true);
    try { await download(readBackup(localStorage)); setMessage('已生成 JSON 备份，请确认文件已保存。'); }
    catch (error) { if (error.name !== 'AbortError') setMessage(`导出失败：${error.message}`); }
    finally { setWorking(false); }
  };
  const selectFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    setPreview(null); setMessage(''); setConfirmed(false); setMode('merge'); setChoice('local');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
      const incoming = validateBackup(JSON.parse(await file.text()));
      const local = readBackup(localStorage);
      setPreview({ incoming, local, fingerprint: JSON.stringify(local), name: file.name, conflicts: findConflicts(local, incoming) });
    } catch (error) { setMessage(`导入失败：${error.message}，现有数据未修改。`); }
    finally { setReading(false); }
  };
  const apply = () => {
    try {
      const local = readBackup(localStorage);
      if (JSON.stringify(local) !== preview.fingerprint) {
        setPreview({ ...preview, local, fingerprint: JSON.stringify(local), conflicts: findConflicts(local, preview.incoming) });
        setConfirmed(false);
        setMessage('本地数据已变化，预览已更新，请重新确认。');
        return;
      }
      const next = planImport(local, preview.incoming, mode, choice);
      const saved = commitBackup(localStorage, next);
      onApplied(saved);
      setPreview(null); setMessage('导入成功。行情将在下一次刷新时更新。');
    } catch (error) { setMessage(`导入失败：${error.message}`); }
  };
  return <section style={{ marginTop: 24 }} aria-label="JSON 数据备份">
    <div style={{ fontWeight: 600, marginBottom: 8 }}>数据备份与迁移</div>
    <p className="muted" style={{ fontSize: 12 }}>数据保存在当前浏览器。导出 JSON 后，可在其他设备导入；文件包含你的持仓信息。</p>
    <div className="row" style={{ gap: 8 }}>
      <button className="button" disabled={working} onClick={exportData}>{working ? '正在导出…' : '导出 JSON'}</button>
      <button className="button" disabled={working || busy || reading} onClick={() => fileRef.current.click()}>{reading ? '正在校验…' : '导入 JSON'}</button>
    </div>
    {busy && <p className="muted">行情或交易正在更新，完成后即可导入。</p>}
    <input aria-label="选择 JSON 备份文件" ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={selectFile} />
    {preview && <div style={{ marginTop: 16 }}>
      <div style={{ overflowWrap: 'anywhere' }}>{preview.name}</div>
      <p>包含 {preview.incoming.funds.length} 只基金、{Object.keys(preview.incoming.holdings).length} 项持仓、{preview.incoming.pendingTrades.length} 笔待处理交易。</p>
      <p className="muted">备份时间：{preview.incoming.exportedAt || '旧版文件未记录'}</p>
      <div className="row" style={{ gap: 12 }}>
        <label><input type="radio" name="backup-mode" checked={mode === 'merge'} onChange={() => { setMode('merge'); setConfirmed(false); }} /> 合并（默认）</label>
        <label><input type="radio" name="backup-mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); setConfirmed(false); }} /> 覆盖恢复</label>
      </div>
      {mode === 'merge' ? <>
        <p className="muted">保留本地设置，追加新基金，合并自选和分组。</p>
        {(preview.conflicts.holdingCodes.length > 0 || preview.conflicts.tradeIds.length > 0) && <>
          <p>冲突：{preview.conflicts.holdingCodes.length} 项持仓、{preview.conflicts.tradeIds.length} 笔待处理交易。</p>
          <p style={{ overflowWrap: 'anywhere' }}>持仓代码：{preview.conflicts.holdingCodes.join('、') || '无'}</p>
          <label>冲突处理：<select value={choice} onChange={e => setChoice(e.target.value)}><option value="local">保留本地</option><option value="file">使用文件中的数据</option></select></label>
        </>}
      </> : <>
        <p>将替换当前全部基金、持仓、分组、待处理交易及备份中的设置。</p>
        <button className="button secondary" disabled={working} onClick={exportData}>先导出当前数据备份</button>
        <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 我确认用文件替换当前数据</label>
      </>}
      <p className="muted">旧备份中的待处理交易可能已经在其他设备记账，请确认后导入。</p>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="button secondary" onClick={() => setPreview(null)}>取消导入</button>
        <button className="button" disabled={busy || working || (mode === 'replace' && !confirmed)} onClick={apply}>确认导入</button>
      </div>
    </div>}
    {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
  </section>;
}
