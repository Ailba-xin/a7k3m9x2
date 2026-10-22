// 多用户版数据抓取：一个仓库服务很多人
// Secret QBUSERS = [{"uid":"a1b2c3","nick":"朋友A","key":"<64位hex>","bark":"https://api.day.app/xxxx","accounts":[{nick,uin,openid,openkey}]}]
// 若没有 QBUSERS，则退回单用户模式（QBCKS + QBKEY → data.json）
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const OFFER = '1450000186';
const GREEN_MAX = 4, DAY = 86400, TRADE_DAYS = 14;
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const now = Math.floor(Date.now() / 1000);
const begin = now - TRADE_DAYS * DAY;

function enc(obj, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), ct: Buffer.concat([out, c.getAuthTag()]).toString('base64') };
}

async function fetchTrades(a) {
  const url = `https://api.unipay.qq.com/v1/r/${OFFER}/trade_record_query`
    + `?CmdCode=query2&SubCmdCode=default&PageNum=1&BeginUnixTime=${begin}&EndUnixTime=${now}`
    + `&PageSize=50&SystemType=portal`
    + `&openid=${encodeURIComponent(a.openid)}&openkey=${encodeURIComponent(a.openkey)}`
    + `&session_id=openid&session_type=kp_accesstoken&qq_appid=101502376`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Referer': 'https://pay.qq.com/h5/trade-record/' } });
    const txt = await r.text();
    const j = JSON.parse(txt);
    if (j.ret !== 0 && j.ret !== '0') return null;
    return (j.WaterList || []).map(x => ({
      t: Number(x.PayTime || 0), amt: Number(x.PayAmt || 0) / 100,
      ch: String(x.PayChannel || ''), show: String(x.ShowName || x.ProductName || '')
    })).filter(x => x.t > 0);
  } catch (e) { return null; }
}
async function fetchBalance(a) {
  const url = `https://api.unipay.qq.com/v1/r/${OFFER}/wechat_query`
    + `?cmd=4&pf=vip_m-pay_html5-html5&pfkey=pfkey&from_h5=1&from_https=1&format=jsonp__getQBBalance`
    + `&openid=${encodeURIComponent(a.openid)}&openkey=${encodeURIComponent(a.openkey)}`
    + `&session_id=openid&session_type=kp_accesstoken&qq_appid=101502376`;
  try {
    const txt = await (await fetch(url, { headers: { 'User-Agent': ua } })).text();
    const m = /"qb_balance"\s*:\s*(\d+)/.exec(txt);
    return m ? Number(m[1]) / 100 : null;
  } catch (e) { return null; }
}
function isWx(t) { return t.ch === 'wechat' || t.ch === 'weixin'; }

const usersRaw = (process.env.QBUSERS || '').trim();
if (usersRaw) {
  let users = [];
  try { users = JSON.parse(usersRaw); } catch (e) { console.error('QBUSERS 不是合法 JSON'); process.exit(1); }
  const outDir = path.join(process.cwd(), 'u');
  fs.mkdirSync(outDir, { recursive: true });
  let lastTsMap = {};
  try { lastTsMap = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'u', '_ts.json'), 'utf8')); } catch (e) { }
  for (const u of users) {
    if (!u || !u.uid || !u.key) continue;
    const site = {};
    let changes = [];
    const accounts = (u.accounts || []).filter(a => a && a.openid && a.openkey);
    for (const a of accounts) {
      const trades = await fetchTrades(a);
      if (!trades) { site[a.uin] = { uin: a.uin, nick: a.nick || '', err: 1 }; continue; }
      const wx = trades.filter(isWx);
      const wx7 = wx.filter(t => t.t >= now - 7 * DAY);
      const balanced = await fetchBalance(a);
      const prev = lastTsMap[u.uid + ':' + a.uin] || {};
      if (typeof balanced === 'number' && typeof prev.qb === 'number' && Math.abs(prev.qb - balanced) >= 0.01) {
        changes.push(`${a.nick || a.uin} ${prev.qb.toFixed(2)} → ${balanced.toFixed(2)}`);
      }
      lastTsMap[u.uid + ':' + a.uin] = { qb: balanced, ts: now };
      const lastWx = wx7.length ? wx7[0].t : (wx.length ? wx[0].t : 0);
      const freeSlots = Math.max(0, 4 - wx7.length);
      const nextWxAt = wx7.length >= 4 ? wx7[wx7.length - 1].t + 7 * DAY : 0;
      site[a.uin] = {
        uin: a.uin, nick: a.nick || '', wx7: wx7.length,
        wx7sum: Math.round(wx7.reduce((s, t) => s + t.amt, 0) * 100) / 100,
        risk: wx7.length > GREEN_MAX ? 1 : 0, why: '', retry: '',
        wx: wx.slice(0, 30), trades: trades.slice(0, 40),
        qb: balanced, nextWxAt, freeSlots, lastWx, ts: now
      };
      await new Promise(r => setTimeout(r, 400));
    }
    const payload = enc({ ts: now, accounts: site }, u.key);
    fs.writeFileSync(path.join(outDir, u.uid + '.json'), JSON.stringify(payload), 'utf8');
    console.log(`${u.nick || u.uid}: ${Object.keys(site).length} 个号，变化 ${changes.length} 个`);
    // Bark 推送（有变化才推）
    if (changes.length && u.bark) {
      try {
        const title = encodeURIComponent('Q币余额变化 ' + changes.length + ' 个号');
        const body = encodeURIComponent(changes.slice(0, 4).join('\n'));
        await fetch(`${u.bark.replace(/\/$/, '')}/${title}/${body}?group=qb&sound=alarm&level=timeSensitive`);
      } catch (e) { }
    }
  }
  fs.writeFileSync(path.join(outDir, '_ts.json'), JSON.stringify(lastTsMap), 'utf8');
  fs.writeFileSync(path.join(process.cwd(), 'status.json'), JSON.stringify({ ts: now, users: users.length }), 'utf8');
  console.log('多用户完成');
  process.exit(0);
}

// ---------- 单用户（老逻辑） ----------
const cks = JSON.parse(process.env.QBCKS || '[]');
if (!Array.isArray(cks) || !cks.length) { console.error('QBUSERS 和 QBCKS 都为空'); process.exit(1); }
const site = {};
for (const a of cks) {
  const trades = await fetchTrades(a) || [];
  const wx = trades.filter(isWx);
  const wx7 = wx.filter(t => t.t >= now - 7 * DAY);
  const qb = await fetchBalance(a);
  site[a.uin] = { uin: String(a.uin), nick: a.nick || '', wx7: wx7.length,
    wx7sum: Math.round(wx7.reduce((s, t) => s + t.amt, 0) * 100) / 100,
    risk: wx7.length > GREEN_MAX ? 1 : 0, why: '', retry: '',
    wx: wx.slice(0, 30), trades: trades.slice(0, 40), qb,
    nextWxAt: wx7.length >= 4 ? wx7[wx7.length - 1].t + 7 * DAY : 0,
    freeSlots: Math.max(0, 4 - wx7.length), ts: now };
  await new Promise(r => setTimeout(r, 500));
}
const keyHex = (process.env.QBKEY || '').trim();
const payload = keyHex.length === 64 ? enc({ ts: now, accounts: site }, keyHex) : { ts: now, accounts: site };
fs.writeFileSync(path.join(process.cwd(), 'u', 'self.json'), JSON.stringify(payload), 'utf8');
try { fs.mkdirSync(path.join(process.cwd(), 'u'), { recursive: true }); } catch (e) { }
fs.writeFileSync(path.join(process.cwd(), 'u', 'self.json'), JSON.stringify(payload), 'utf8');
console.log('单用户完成 ' + Object.keys(site).length);