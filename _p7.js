
/* ---------- 电脑中转（Tailscale 公网）：朋友的账号用它拿微信支付数据 ---------- */
(function(){
  // ★ 2026-10-18 优先用 Cloudflare 中转（电脑关机也能用），电脑中转作为备用
  var RELAYS = [
    'https://qbmobile.icu/api/relay?u='
  ];
  var RELAY = RELAYS[0];
  var DAY = 86400;
  var lastRun = 0;

  function tradesOf(a){
    var now = Math.floor(Date.now()/1000), begin = now - 14*DAY;
    var target = 'https://api.unipay.qq.com/v1/r/1450000186/trade_record_query'
      + '?CmdCode=query2&SubCmdCode=default&PageNum=1&BeginUnixTime=' + begin + '&EndUnixTime=' + now
      + '&PageSize=50&SystemType=portal'
      + '&openid=' + encodeURIComponent(a.openid||'') + '&openkey=' + encodeURIComponent(a.openkey||'')
      + '&session_id=openid&session_type=kp_accesstoken&qq_appid=101502376';
    // 单次 20 秒超时（手机走 Cloudflare 中转实测 8 秒左右，8 秒太短）
    function once(ms){
      return new Promise(function(resolve){
        var done=false, ctl=null;
        try { ctl = new AbortController(); } catch(e){}
        var timer=setTimeout(function(){ if(done) return; done=true; try{ if(ctl) ctl.abort(); }catch(e){} resolve(null); }, ms);
        fetch(RELAY + encodeURIComponent(target), { cache:'no-store', signal: ctl?ctl.signal:undefined })
          .then(function(r){ return r.text(); })
          .then(function(txt){
            if(done) return; done=true; clearTimeout(timer);
            var j=null; try { j=JSON.parse(txt); } catch(e){}
            resolve((j && (j.ret===0||j.ret==='0'||j.ret===1018||j.ret===1001)) ? j : null);
          })
          .catch(function(){ if(done) return; done=true; clearTimeout(timer); resolve(null); });
      });
    }
    // 失败再试 1 次（共 2 次），间隔 2 秒
    function attempt(n){
      return once(20000).then(function(j){
        if (j) return j;
        if (n >= 1) return null;
        return new Promise(function(r){ setTimeout(r, 2000); }).then(function(){ return attempt(n+1); });
      });
    }
    return attempt(0);
  }

  function computeSite(a, list){
    var now = Math.floor(Date.now()/1000);
    var trades = (list || []).map(function(x){
      return { t: Number(x.PayTime||0), amt: Number(x.PayAmt||0)/100,
               ch: String(x.PayChannel||''), show: String(x.ShowName||x.ProductName||'') };
    }).filter(function(x){ return x.t > 0; }).sort(function(p,q){ return q.t - p.t; });
    var wx = trades.filter(function(t){ return t.ch === 'wechat' || t.ch === 'weixin'; });
    var wx7 = wx.filter(function(t){ return t.t >= now - 7*DAY; });
    var risk = wx7.length > 4 ? 1 : 0;
    // ★ 2026-10-22 7天后可充：最后一笔微信充值 + 7 天（和电脑版口径一致）
    // ★ 2026-10-22 名额滚动：每周 4 个名额，每笔占 7 天
    //   已满 4 笔 → 下一次能充 = 最早那笔(第4笔) + 7 天；不满 4 笔 → 现在就能充
    var lastWx = wx7.length ? wx7[0].t : (wx.length ? wx[0].t : 0);
    var freeSlots = Math.max(0, 4 - wx7.length);
    var nextWxAt = 0;
    if (wx7.length >= 4) nextWxAt = wx7[wx7.length-1].t + 7*DAY;
    return {
      uin: a.uin, wx7: wx7.length, nextWxAt: nextWxAt, lastWx: lastWx,
      freeSlots: freeSlots, releaseAt: (wx7.length>=4 ? (wx7[wx7.length-1].t + 7*DAY) : 0),
      wxFull: (wx7.length>=4?1:0),
      wx7sum: Math.round(wx7.reduce(function(s,t){ return s + t.amt; }, 0) * 100) / 100,
      risk: risk,
      why: risk ? ('7 天内微信支付 ' + wx7.length + ' 笔，超过 4 笔') : '',
      retry: '', trades: trades.slice(0, 40),
      wx: wx.slice(0, 30).map(function(t){ return { t: t.t, amt: t.amt, ch: t.ch }; })
    };
  }

  // 队列：最多 4 个并发，避免 17 个号同时打中转导致全部超时
  var relayQueue = [], relayActive = 0, RELAY_MAX = 4;
  function relayPump(){
    while (relayActive < RELAY_MAX && relayQueue.length) {
      var a = relayQueue.shift();
      relayActive++;
      (function(a){
        // ★ 2026-10-22 已有 data.json 数据：保留显示，后台静默更新（不设 pending → 不会消失/闪烁）
        var _have = (SITE||{})[a.uin];
        var _quiet = !!(_have && typeof _have.wx7 === 'number' && !_have.err);
        var cur = (SITE||{})[a.uin] || { uin: a.uin };
        if(!_quiet){ cur.pending = 1; (SITE||{})[a.uin] = cur; patchRows(); }
        tradesOf(a).then(function(j){
          if (j && (j.ret === 0 || j.ret === '0')) {
            (SITE||{})[a.uin] = computeSite(a, j.WaterList || []);
            window.__siteLoaded = true;
          } else {
            var prev = (SITE||{})[a.uin];
            if (!prev || !prev.trades || !prev.trades.length) (SITE||{})[a.uin] = { uin: a.uin, err: 1 };
          }
          try { lss('qbstd_site_cache_v1', { ts: Date.now(), accounts: SITE }); } catch(e){}
          patchRows();
          relayActive--; relayPump();
        });
      })(a);
    }
  }
  function relayAll(){
    if (!ACC || !ACC.length) { setTimeout(relayAll, 4000); return; }
    if (relayActive > 0 || relayQueue.length) return;
    relayQueue = ACC.slice();
    relayPump();
  }

  // 失败账号每 45 秒自动重试（最多 5 轮），也可以点「重试」立即重来
  var errRounds = 0;
  setInterval(function(){
    if (!ACC || !ACC.length || errRounds >= 5) return;
    if (relayActive > 0 || relayQueue.length) return;
    var need = [];
    for (var i=0;i<ACC.length;i++){ var s=(SITE||{})[ACC[i].uin]; if (s && s.err) need.push(ACC[i]); }
    if (!need.length) { errRounds = 0; return; }
    errRounds++;
    relayQueue = need.slice();
    relayPump();
  }, 45000);

  window.retryTrades = function(uin){
    var a=null; for (var i=0;i<ACC.length;i++) if (String(ACC[i].uin)===String(uin)) { a=ACC[i]; break; }
    if (!a) return;
    (SITE||{})[uin] = { uin: uin, pending: 1 };
    patchRows();
    tradesOf(a).then(function(j){
      if (j && (j.ret===0||j.ret==='0')) { (SITE||{})[uin]=computeSite(a, j.WaterList||[]); window.__siteLoaded = true; }
      else (SITE||{})[uin]={ uin: uin, err: 1 };
      try { lss('qbstd_site_cache_v1', { ts: Date.now(), accounts: SITE }); } catch(e){}
      patchRows();
    });
  };

  window.addEventListener('load', function(){ setTimeout(relayAll, 3000); });
  // 2026-10-22：后台刷新 10 → 15 分钟（少一点「一直在刷新」的观感）
  setInterval(relayAll, 15 * 60 * 1000);
})();

/* ---------- 备份 / 恢复 ---------- */
var bakMode='export';
function openBackup(){
  bakMode='export';
  document.getElementById('bakTitle').textContent='导出备份';
  document.getElementById('bakTip').textContent='复制下面这串内容保存好（微信收藏/备忘录）；换手机或清缓存后粘贴回来即可恢复。';
  document.getElementById('bakBtn').textContent='复制';
  var err=document.getElementById('bakErr'); err.textContent=''; err.style.color='#16873f';
  var data={v:1,ts:Date.now(),accounts:ACC,key:(localStorage.getItem('qbstd_key_v1')||''),iv:getIV(),hide:HIDE};
  var t=document.getElementById('bakText'); t.value=JSON.stringify(data);
  document.getElementById('bakBox').hidden=false;
  setTimeout(function(){ t.focus(); t.select(); },50);
}
function openRestore(){
  bakMode='restore';
  document.getElementById('bakTitle').textContent='恢复备份';
  document.getElementById('bakTip').textContent='把之前导出的备份内容粘贴到下面，点「恢复」。';
  document.getElementById('bakBtn').textContent='恢复';
  var err=document.getElementById('bakErr'); err.textContent=''; err.style.color='#c0392b';
  document.getElementById('bakText').value='';
  document.getElementById('bakBox').hidden=false;
  setTimeout(function(){ document.getElementById('bakText').focus(); },50);
}
function closeBackup(){ document.getElementById('bakBox').hidden=true; }
function backupAction(){ if(bakMode==='export') copyBackup(); else doRestore(); }
function copyBackup(){
  var t=document.getElementById('bakText'), err=document.getElementById('bakErr');
  t.focus(); t.select();
  function done(good,msg){ err.style.color=good?'#16873f':'#c0392b'; err.textContent=msg; }
  var ok=false;
  try{ ok=document.execCommand('copy'); }catch(e){}
  if(ok){ done(true,'已复制，去微信收藏/备忘录粘贴保存'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t.value).then(function(){ done(true,'已复制，去微信收藏/备忘录粘贴保存'); },function(){ done(false,'复制失败，请长按输入框全选复制'); });
  } else done(false,'请长按输入框全选复制');
}
function doRestore(){
  var err=document.getElementById('bakErr');
  try{
    var d=JSON.parse(document.getElementById('bakText').value||'');
    if(!d || !Array.isArray(d.accounts)) throw new Error('格式不对');
    var list=d.accounts.filter(function(a){ return a && a.openid && a.openkey; });
    if(!list.length) throw new Error('备份里没有有效账号');
    ACC=list; saveAll();
    if(d.key && String(d.key).length===64){ try{ localStorage.setItem('qbstd_key_v1',String(d.key)); }catch(e){} }
    if(typeof d.hide==='boolean'){ HIDE=d.hide; lss(KEY_HIDE,HIDE); document.getElementById('uinbtn').textContent=HIDE?'显示QQ号':'隐藏QQ号'; }
    if(typeof d.iv==='number' && d.iv>=1 && d.iv<=60){ IV=d.iv; lss(KEY_IV,IV); startTimer(); }
    err.style.color='#16873f'; err.textContent='恢复成功，正在刷新…';
    setTimeout(function(){ closeBackup(); paint(); if(typeof refreshAll==='function') refreshAll(); },600);
  }catch(e){ err.style.color='#c0392b'; err.textContent='恢复失败：'+e.message; }
}

/* ---------- 后台数据状态 / iOS 提示 ---------- */
function checkStatus(){
  var el=document.getElementById('stale'); if(!el) return;
  if(window.navigator.standalone===true){
    el.textContent='ℹ️ iOS 主屏幕模式可能丢数据：建议用 Safari 书签打开，并在「设置」里定期导出备份。';
    el.style.display='block'; return;
  }
  fetch('status.json?t='+Date.now(),{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(s){
    var age=Math.floor(Date.now()/1000)-(Number(s.ts)||0);
    if(age>5400){ el.textContent='⚠ 后台数据已 '+(age>=3600?Math.floor(age/3600)+' 小时':Math.floor(age/60)+' 分钟')+' 未更新，可能是 CK 过期'; el.style.display='block'; }
    else if(s.ok===false){ el.textContent='⚠ 最近一次后台刷新：'+(s.errCount||0)+' 个账号失败'+(s.error?('（'+s.error+'）'):''); el.style.display='block'; }
    else { el.style.display='none'; }
  }).catch(function(){});
}

/* ---------- 合并定时器：2 秒一次，页面隐藏时暂停 ---------- */
(function(){
  // 2026-10-22 性能：5 秒一次；滑动/触摸中跳过；防重入
  var _lastScrollAt = 0;
  window.addEventListener('scroll', function () { _lastScrollAt = Date.now(); }, { passive: true });
  window.addEventListener('touchmove', function () { _lastScrollAt = Date.now(); }, { passive: true });
  var _tickBusy = false;
  function tick(){
    if (document.hidden) return;
    if (Date.now() - _lastScrollAt < 700) return;
    if (_tickBusy) return;
    _tickBusy = true;
    try { patchRows(); } catch (e) { }
    try { patchRows2(); } catch (e) { }
    setTimeout(function () { _tickBusy = false; }, 250);
  }
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) tick(); });
  window.addEventListener('load', function(){ setTimeout(function(){ tick(); checkStatus(); }, 1000); });
})();
