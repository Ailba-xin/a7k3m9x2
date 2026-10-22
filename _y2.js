
/* ---------- 交易数据（来自 GitHub Actions 定时抓取的 data.json，同源无跨域） ---------- */
var SITE = {};
function b64ToBytes(s){
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hexToBytes(h){
  var out = new Uint8Array(h.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
async function decryptPayload(j){
  var keyHex = ls('qbstd_key_v1', '');
  if (!keyHex || String(keyHex).length !== 64) return null;
  if (!(window.crypto && crypto.subtle)) return null;
  try {
    var key = await crypto.subtle.importKey('raw', hexToBytes(String(keyHex)), { name: 'AES-GCM' }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(j.iv), tagLength: 128 }, key, b64ToBytes(j.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch (e) { return null; }
}
function hasDataKey() {
    try { return !!(localStorage.getItem('qbstd_key_v1') || '').trim(); } catch (e) { return false; }
  }
  function loadSite(){
  // ★ 2026-10-22 秒开①：先用【App 后台预取】的数据立刻画（安卓 App 才有）
  try{
    if (window.AndroidBridge && AndroidBridge.getSiteCache) {
      var _j = AndroidBridge.getSiteCache();
      if (_j && _j.length > 20) {
        var _s = JSON.parse(_j);
        if (_s && Object.keys(_s).length) { SITE = _s; try{ patchRows(); }catch(e){} }
      }
    }
  }catch(e){}
  // ★ 秒开②：再用上次缓存（6 小时内有效），然后才去读 data.json
  try{
    var _cache = ls('qbstd_site_cache_v1', null);
    if (_cache && _cache.accounts && (Date.now() - (_cache.ts||0) < 6*3600*1000)) {
      SITE = _cache.accounts;
      try{ patchRows(); }catch(e){}
    }
  }catch(e){}
    // ★ 没有钥匙 = 别人的设备 → 不请求 data.json（保护主人数据）
    if (!hasDataKey()) { SITE = {}; try { localStorage.removeItem('qbstd_site_cache_v1'); } catch (e) { } return; }
    // ★ 2026-10-23 数据源：本地优先（朋友仓库），失败则读 data 分支的 raw（我们主站用，免 Pages 构建）
    var _DATA_URLS = ['data.json?t=' + Date.now(), 'https://raw.githubusercontent.com/Ailba-xin/qb-mobile-app/data/data.json?t=' + Date.now()];
    function _fetchFirst(i){
      if (i >= _DATA_URLS.length) return Promise.reject(new Error('no data'));
      return fetch(_DATA_URLS[i], { cache: 'no-store' }).then(function(r){
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).catch(function(){ return _fetchFirst(i + 1); });
    }
    return _fetchFirst(0)
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      if (!j) return;
      if (j.v === 1 && j.ct) {
        return decryptPayload(j).then(function(plain){
          if (plain && plain.accounts) {
            SITE = plain.accounts; window.__siteLoaded = true;
            // ★ 用 data.json 里的余额先把账号填上（秒显示余额，不用等腾讯查询）
            try{ for(var _i=0;_i<ACC.length;_i++){ var _a=ACC[_i]; var _s=SITE[_a.uin]; if(_s && typeof _s.qb==='number' && (_a.qb===undefined||_a.qb===null||_a.qb===0)){ _a.qb=_s.qb; } } }catch(e){}
            try{ paint(); }catch(e){}
            patchRows();
          }
          else { SITE = {}; patchRows(); }
        });
      }
      if (j.accounts) { SITE = j.accounts; window.__siteLoaded = true;
        try{ for(var _i=0;_i<ACC.length;_i++){ var _a=ACC[_i]; var _s=SITE[_a.uin]; if(_s && typeof _s.qb==='number' && (_a.qb===undefined||_a.qb===null||_a.qb===0)){ _a.qb=_s.qb; } } }catch(e){}
        try{ paint(); }catch(e){}
        patchRows(); }
    })
    .catch(function(){
      // ★ 2026-10-18 加载失败自动重试（最多 2 次），避免偶发网络波动导致数据不显示
      if (!window.__siteRetry) window.__siteRetry = 0;
      if (window.__siteRetry < 2) {
        window.__siteRetry++;
        setTimeout(function(){ try { loadSite(); } catch (e) { } }, 2500);
      }
    })
    .then(function(){ window.__siteRetry = 0; });
}
function uinOf(li){
  var el = li.querySelector('.uin');
  return el ? (el.getAttribute('data-uin') || '') : '';
}
function patchRows(){
  var lis = document.querySelectorAll('#list li');
  for(var i=0;i<lis.length;i++){
    var li = lis[i];
    var nameEl = li.querySelector('.name');
    var amtEl = li.querySelector('.amt');
    if(!nameEl || !amtEl) continue;
    // 从账号数据里找 uid：页面渲染时把 uin 放在 .uin 的 textContent 里（已可能被隐藏），
    // 所以我们用 ACC 数组的下标来定位（顺序一致）
    var a = ACC[i];
    if(!a) continue;
    var s = (SITE||{})[a.uin] || {};
    // 1) 微信支付格
    var wxs = amtEl.querySelector('.wxs');
    if(!wxs){ wxs = document.createElement('div'); wxs.className='wxs'; amtEl.appendChild(wxs); }
    if(s.err && typeof s.wx7 !== 'number'){ wxs.innerHTML = '明细没查到 · <u>重试</u>'; wxs.className='wxs warn'; wxs.style.cursor='pointer'; wxs.onclick=function(){ window.retryTrades(a.uin); }; }
    else if(s.err && typeof s.wx7 === 'number'){ wxs.style.cursor='pointer'; wxs.onclick=function(){ window.retryTrades(a.uin); };
      var _h3 = '微信 <b>'+s.wx7+'</b> 次 · '+Number(s.wx7sum||0).toFixed(2)+' 元';
      if(s.nextWxAt){ var _nd3=new Date(s.nextWxAt*1000); var _p3=function(n){return (n<10?'0':'')+n;}; var _l3=Math.ceil((s.nextWxAt-Date.now()/1000)/86400);
        if(_l3<=0) _h3+=' · <b style="color:#16873f">现在可充</b>'; else _h3+=' · <b>'+_p3(_nd3.getMonth()+1)+'-'+_p3(_nd3.getDate())+' '+_p3(_nd3.getHours())+':'+_p3(_nd3.getMinutes())+'</b> 可充'; }
      wxs.innerHTML = _h3 + ' <span style="color:#b8860b;font-size:11px">· 更新失败，点这里重试</span>';
      wxs.className='wxs'; }
    else if(s.pending){ wxs.textContent='读取中…'; wxs.className='wxs'; wxs.style.cursor=''; wxs.onclick=null; }
    else if(typeof s.wx7 === 'number'){ wxs.style.cursor=''; wxs.onclick=null; if(s.wx7===0 && !(s.wx7sum)){ wxs.textContent = '无记录'; wxs.className='wxs'; } else {
        var _h2 = '微信 <b>'+s.wx7+'</b> 次 · '+Number(s.wx7sum||0).toFixed(2)+' 元';
        if(s.wx7>=4 && s.releaseAt){
          var _nd = new Date(s.releaseAt*1000);
          var _p = function(n){ return (n<10?'0':'')+n; };
          var _left = Math.ceil((s.releaseAt - Date.now()/1000)/86400);
          var _txt = _p(_nd.getMonth()+1)+'-'+_p(_nd.getDate())+' '+_p(_nd.getHours())+':'+_p(_nd.getMinutes());
          if(_left <= 0){ _h2 += ' · <b style="color:#16873f">现在可充</b>'; }
          else { _h2 += ' · 满4笔 → <b>'+_txt+'</b> 可充（'+_left+' 天后）'; }
        } else if(s.wx7>=0 && s.freeSlots>0){
          _h2 += ' · <b style="color:#16873f">现在可充</b>（剩 '+s.freeSlots+' 个名额）';
        }
        wxs.innerHTML = _h2; wxs.className = (s.wx7<4?'wxs warn':'wxs');
      } }
    else { wxs.textContent=''; }
    // 2) 风险标签
    var tag = nameEl.querySelector('.tag-risk');
    if(s.risk===1){
      if(!tag){ tag=document.createElement('span'); tag.className='tag tag-risk'; tag.textContent='⚠ 账号风险'; nameEl.appendChild(tag); }
      tag.title = (s.why||'') + (s.retry? '｜建议 '+s.retry+' 再试':'');
    } else if(tag){ tag.remove(); }
    // 3) 明细：微信支付记录 + 交易记录
    var det = li.querySelector('.det');
    if(det){
      var key = 'det_built_' + a.uin + '_' + (s.wx7===undefined?'x':s.wx7) + '_' + (s.trades?s.trades.length:0);
      if(det.getAttribute('data-k') !== key){
        det.setAttribute('data-k', key);
        var h = '';
        // ★ 2026-10-18 明细显示余额 + 比上次的变动
        if (a && a.qb !== undefined && a.qb !== null) {
          var dtxt = '';
          if (a.delta !== null && a.delta !== undefined && Math.abs(a.delta) >= 0.01) {
            dtxt = ' <span style="color:' + (a.delta > 0 ? '#0f7a37' : '#c0392b') + ';font-weight:700">'
                 + (a.delta > 0 ? '▲ +' : '▼ ') + Number(a.delta).toFixed(2) + '</span>';
          }
          h += '<div class="det-bal">余额：<b>' + Number(a.qb).toFixed(2) + '</b> Q币' + dtxt + '</div>';          if(s.nextWxAt){
            var _nd2 = new Date(s.nextWxAt*1000); var _p2 = function(n){ return (n<10?'0':'')+n; };
            var _left2 = Math.ceil((s.nextWxAt - Date.now()/1000)/86400);
            h += '<div class="det-row" style="color:#a25b1a;font-weight:600">★ 7天后可充：'
               + _p2(_nd2.getMonth()+1)+'-'+_p2(_nd2.getDate())+' '+_p2(_nd2.getHours())+':'+_p2(_nd2.getMinutes())
               + (s.wx7>=4 ? '（本周已满 '+s.wx7+' 笔，还差 '+_left2+' 天）' : (s.wx7>0 ? '（已充 '+s.wx7+' 笔）' : ''))
               + '</div>';
          }
        }
        if(s.risk===1) h += '<div class="det-risk">⚠ '+ (s.why||'这个号已经充不进微信支付了') + (s.retry? '<br>建议 '+s.retry+' 再试一笔':'') +'</div>';
        var wx = s.wx || [];
        if(wx.length){
          h += '<div class="det-list">';
          for(var k=0;k<wx.length;k++){
            var r2=wx[k];
            // ★ 2026-10-22 名额已经释放的记录不再显示（只看还有效/即将释放的）
            if(r2.t + 7*86400 <= Date.now()/1000) continue;
            if(k >= 12) break;
            var d2=new Date(r2.t*1000), p2=function(n){return (n<10?'0':'')+n;};
            // ★ 2026-10-22 每条微信记录后面加「7天后可充」= 这笔时间 + 7 天（和电脑版明细一致）
            var _t7 = (r2.t + 7*86400) * 1000;
            var _d7 = new Date(_t7);
            var _past7 = _t7 <= Date.now();
            h += '<div class="det-row wx"><span class="t">'+p2(d2.getMonth()+1)+'-'+p2(d2.getDate())+' '+p2(d2.getHours())+':'+p2(d2.getMinutes())+'</span>'
               + '<span>微信 +'+Number(r2.amt).toFixed(2)+'</span>'
               + '<span style="color:'+(_past7?'#9aa4b1':'#a25b1a')+';font-weight:'+(_past7?'400':'600')+'">'
               + '名额 '+p2(_d7.getMonth()+1)+'-'+p2(_d7.getDate())+' '+p2(_d7.getHours())+':'+p2(_d7.getMinutes())
               + (_past7 ? ' 释放（已释放）' : ' 可充')
               + '</span></div>';
          }
          h += '</div>';
        }
        var tr = s.trades || [];
        if(tr.length){
          h += '<div class="det-list">';
          for(var m=0;m<Math.min(tr.length,10);m++){
            var r3=tr[m], d3=new Date(r3.t*1000), p3=function(n){return (n<10?'0':'')+n;};
            var balTxt = '';
            if (s.hist && s.hist.length) {
              for (var hi = 0; hi < s.hist.length; hi++) {
                if (s.hist[hi][0] >= r3.t) { balTxt = ' <span style="color:#1c589e;font-weight:700">余额 ' + Number(s.hist[hi][1]).toFixed(2) + '</span>'; break; }
              }
            }
            h += '<div class="det-row"><span class="t">'+p3(d3.getMonth()+1)+'-'+p3(d3.getDate())+' '+p3(d3.getHours())+':'+p3(d3.getMinutes())+'</span><span>'+(r3.show||'')+' '+(r3.ch||'')+' +'+Number(r3.amt).toFixed(2)+balTxt+'</span></div>';
          }
          h += '</div>';
        }
        det.innerHTML = h || det.innerHTML;
      }
    }
  }
}
loadSite();
setInterval(function(){ loadSite(); }, 10*60*1000);
document.addEventListener('visibilitychange', function(){ if(!document.hidden) loadSite(); });
