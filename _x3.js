
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
document.addEventListener('click', function (ev) {
  var li = ev.target && ev.target.closest ? ev.target.closest('#list li') : null;
  if (!li) return;
  if (ev.target.closest('a,button')) return;
  var lis = document.querySelectorAll('#list li'), idx = -1;
  for (var i = 0; i < lis.length; i++) if (lis[i] === li) { idx = i; break; }
  if (idx < 0) return;
  if (li.classList.contains('open')) { li.classList.remove('open'); return; }
  li.classList.add('open');
  markRead(idx);
  var a = ACC[idx];
  if (a && a.delta) { delete a.delta; delete a.deltaAt; saveAll(); }
  patchRows2();
}, false);

/* 双击行 → 收起（A版行为） */
var lastTapT = 0, lastTapI = -1;
document.addEventListener('click', function (ev) {
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
