
/* ---------- A版同款：折叠展开 / 已读 / 异常提示 / 回顶部 / 断网缓存 ---------- */
var KEY_SITE_CACHE = 'qbstd_site_cache_v1';
var BIG = 100;                 // 大额变动阈值（和电脑版默认一致）
var SITE_TS = 0;

function applySiteCache(){
  try { var c = ls(KEY_SITE_CACHE, null); if (c && c.accounts) { SITE = c.accounts; SITE_TS = c.ts || 0; } } catch(e){}
}
function saveSiteCache(){
  try { lss(KEY_SITE_CACHE, { ts: Date.now(), accounts: SITE }); } catch(e){}
}
applySiteCache();

function bigOf(a){
  if (!a) return false;
  var d = Number(a.delta || 0);
  return Math.abs(d) >= BIG;
}
function readKey(i){ return 'qbstd_read_' + (ACC[i] && (ACC[i].openid || i)); }
function isRead(i){ return ls(readKey(i), false) === true; }
function markRead(i){ lss(readKey(i), true); }

function paintAlert(){
  var bar = document.getElementById('alertbar');
  if (!bar) return;
  var risks = [], bigs = [];
  for (var i = 0; i < ACC.length; i++) {
    var a = ACC[i];
    var s = (SITE||{})[a.uin] || {};
    if (s.risk === 1) risks.push(a.nick || a.uin);
    if (bigOf(a) && !isRead(i)) bigs.push(a.nick || a.uin);
  }
  if (!risks.length && !bigs.length) { bar.className = ''; bar.textContent = ''; return; }
  var txt = [];
  if (risks.length) txt.push('⚠ ' + risks.length + ' 个账号风险：' + risks.slice(0, 4).join('、') + (risks.length > 4 ? ' 等' : ''));
  if (bigs.length) txt.push('△ ' + bigs.length + ' 个号有大额变动（≥' + BIG + '）：' + bigs.slice(0, 4).join('、') + (bigs.length > 4 ? ' 等' : ''));
  bar.textContent = txt.join('\n');
  bar.className = 'show ' + (risks.length ? 'danger' : 'warn');
}

/* 2026-10-23 点横幅：展开所有大额变动/风险账号的明细，然后提示消失 */
function openBigDetails(){
  var lis = document.querySelectorAll('#list li');
  var first = null;
  for (var i = 0; i < ACC.length && i < lis.length; i++) {
    var a = ACC[i];
    var s = (SITE||{})[a.uin] || {};
    var isBig = !!bigOf(a) && !isRead(i);
    var isRisk = s.risk === 1;
    if (isBig || isRisk) {
      lis[i].classList.add('open');
      if (isBig) markRead(i);
      if (!first) first = lis[i];
    }
  }
  paintAlert();
  try { patchRows(); } catch(e) { }
  if (first) { try { first.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) { } }
}
/* 2026-10-23 点横幅：弹出「哪几个号变了多少钱」清单 */
function openBigList(){
  var arr = [];
  for (var i = 0; i < ACC.length; i++) {
    var a = ACC[i];
    if (!bigOf(a) || isRead(i)) continue;
    arr.push({ i: i, a: a, d: Number(a.delta || 0) });
  }
  arr.sort(function(p, q){ return Math.abs(q.d) - Math.abs(p.d); });
  var box = document.getElementById('bigList');
  if (!box) return;
  if (!arr.length) { box.innerHTML = '<p style="color:#6b7686">没有未读的大额变动</p>'; }
  else {
    var h = '';
    for (var k = 0; k < arr.length; k++) {
      var a2 = arr[k].a, d2 = arr[k].d;
      var nick = a2.nick || ('账号' + (arr[k].i + 1));
      var uin = (typeof maskUin === 'function') ? maskUin(a2.uin || '') : (a2.uin || '');
      var qb = (a2.qb === undefined || a2.qb === null) ? '-' : Number(a2.qb).toFixed(2);
      h += '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 2px;border-bottom:1px dashed #e3e8ef">'
         + '<span><b>' + esc(nick) + '</b><span style="color:#8a96a6;font-size:12px;margin-left:6px">' + esc(uin) + '</span></span>'
         + '<span style="white-space:nowrap"><b style="color:' + (d2 > 0 ? '#16873f' : '#c0392b') + '">'
         + (d2 > 0 ? '▲ +' : '▼ ') + d2.toFixed(2) + '</b>'
         + '<span style="color:#8a96a6;font-size:12px;margin-left:8px">余额 ' + qb + '</span></span></div>';
    }
    box.innerHTML = h;
  }
  document.getElementById('bigBox').hidden = false;
}
function closeBig(){ try{ document.getElementById('bigBox').hidden = true; }catch(e){} }
function ackBig(){
  for (var i = 0; i < ACC.length; i++) { if (bigOf(ACC[i]) && !isRead(i)) markRead(i); }
  closeBig();
  try { paintAlert(); } catch(e) { }
  try { patchRows2(); } catch(e) { }
}
function patchRows2(){
  paintAlert();
  var lis = document.querySelectorAll('#list li');
  for (var i = 0; i < lis.length; i++) {
    var li = lis[i], a = ACC[i];
    if (!a) continue;
    // 1) 箭号 + 可点击
    var row = li.querySelector('.row');
    if (row && !row.querySelector('.arrow')) {
      var ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '›';
      row.appendChild(ar);
      row.classList.add('li-tap');
    }
    // 2) 已读：大额变动标记过就自动收起来
    if (bigOf(a) && isRead(i)) li.classList.add('read');
    // 3) 折叠状态下不加载明细内容（省事：保持原样，CSS 控制显示）
  }
  // 回顶部按钮
  var tb = document.getElementById('topBtn');
  if (tb) { if ((window.pageYOffset || 0) > 320) tb.classList.add('show'); else tb.classList.remove('show'); }
}

/* 点击整行 → 展开/收起明细；第一次展开算"已读"（大额变动提示消失） */
/* 点顶部提示条 → 展开明细并消失 */
document.addEventListener('click', function (ev) {
  var _bar = ev.target && ev.target.closest ? ev.target.closest('#alertbar') : null;
  if (_bar) { try { openBigList(); } catch(e) { } return; }
  if (window.__noClickUntil && Date.now() < window.__noClickUntil) return;
  var li = ev.target && ev.target.closest ? ev.target.closest('#list li') : null;
  if (!li) return;
  if (ev.target.closest('a,button')) return;
  var lis = document.querySelectorAll('#list li'), idx = -1;
  for (var i = 0; i < lis.length; i++) if (lis[i] === li) { idx = i; break; }
  if (idx < 0) return;
  if (li.classList.contains('open')) { li.classList.remove('open'); return; }
  li.classList.add('open');
  markRead(idx);
  // ★ 2026-10-23 点开明细 = 已看过变动 → 清掉这条变动标记（下次再有变动会重新出现）
  try {
    var _a = ACC[idx];
    if (_a && (_a.delta !== undefined && _a.delta !== null)) {
      delete _a.delta; delete _a.deltaAt;
      try { saveAll(); } catch(e) { }
      var _u = li.querySelector('.uin');
      if (_u) { _u.innerHTML = (typeof maskUin === 'function') ? esc(maskUin(_a.uin || '')) : esc(_a.uin || ''); }
      try { paintAlert(); } catch(e) { }
    }
  } catch(e) { }
  var a = ACC[idx];
  if (a && a.delta) { delete a.delta; delete a.deltaAt; saveAll(); }
  patchRows2();
}, false);

/* 双击行 → 收起（A版行为） */
var lastTapT = 0, lastTapI = -1;
/* 点顶部提示条 → 展开明细并消失 */
document.addEventListener('click', function (ev) {
  var _bar = ev.target && ev.target.closest ? ev.target.closest('#alertbar') : null;
  if (_bar) { try { openBigList(); } catch(e) { } return; }
  if (window.__noClickUntil && Date.now() < window.__noClickUntil) return;
  var li = ev.target && ev.target.closest ? ev.target.closest('#list li') : null;
  if (!li) return;
  var now = Date.now();
  var lis = document.querySelectorAll('#list li'), idx = -1;
  for (var i = 0; i < lis.length; i++) if (lis[i] === li) { idx = i; break; }
  if (now - lastTapT < 340 && idx === lastTapI) { li.classList.remove('open'); lastTapT = 0; return; }
  lastTapT = now; lastTapI = idx;
}, false);

/* 回顶部按钮 */
(function(){
  var b = document.createElement('button');
  b.id = 'topBtn'; b.textContent = '↑'; b.title = '回到顶部';
  b.onclick = function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); };
  document.body.appendChild(b);
})();
/* 2026-10-22 性能：滚动时不再重绘（卡顿元凶已移除） */

/* 异常提示条位置：插在合计卡片后面 */
(function(){
  var bar = document.createElement('div');
  bar.id = 'alertbar';
  var sum = document.querySelector('.sum');
  if (sum && sum.parentNode) sum.parentNode.insertBefore(bar, sum.nextSibling);
})();

/* 定时合并进主渲染（原来的 patchRows 也在跑） */
window.addEventListener('load', function(){ setTimeout(patchRows2, 800); });
