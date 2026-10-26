
var KEY_ACC='qbstd_acc_v1', KEY_HIDE='qbstd_hide_v1';
var ACC=[], HIDE=false, BUSY=false, FIRST=true;

function ls(k,d){ try{ var v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }
function lss(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

function loadAll(){
  ACC = ls(KEY_ACC, []) || [];
  HIDE = ls(KEY_HIDE, false) === true;
  document.getElementById('uinbtn').textContent = HIDE ? '显示QQ号' : '隐藏QQ号';
}
function saveAll(){ lss(KEY_ACC, ACC); }

function maskUin(u){
  if(!u) return '';
  if(!HIDE) return u;
  return u.length<=6 ? u.substring(0,1)+'***' : u.substring(0,4)+'****'+u.substring(u.length-2);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return c==='&'?'&amp;':(c==='<'?'&lt;':(c==='>'?'&gt;':'&quot;'));}); }
function f2(v){ return (v===null||v===undefined||v==='')?'—':Number(v).toFixed(2); }

/* ---------- JSONP 查询：一次一个（接口回调名固定 _getQBBalance） ---------- */
var _cb=null, _seq=0;
function _getQBBalance(data){
  if(typeof _cb==='function'){ var f=_cb; _cb=null; f(data); }
}
function queryOne(a, done){
  var base='https://api.unipay.qq.com/v1/r/1450000186/wechat_query?cmd=4&pf=vip_m-pay_html5-html5&pfkey=pfkey&from_h5=1&from_https=1&format=jsonp__getQBBalance';
  var url=base
    +'&openid='+encodeURIComponent(a.openid||'')
    +'&openkey='+encodeURIComponent(a.openkey||'')
    +'&session_id='+encodeURIComponent(a.sessionId||'openid')
    +'&session_type='+encodeURIComponent(a.sessionType||'kp_accesstoken')
    +'&qq_appid='+encodeURIComponent(a.appid||'101502376')
    +'&_t='+(Date.now())+'_'+(++_seq);
  var finished=false;
  function fin(d){ if(finished) return; finished=true; if(_cb===fin2) _cb=null; done(d); }
  var fin2=fin;
  _cb=fin;
  var s=document.createElement('script');
  s.src=url;
  s.onerror=function(){ fin(null); };
  document.body.appendChild(s);
  setTimeout(function(){ fin(null); }, 8000);
}

function refreshAll(){
  if(BUSY) return;
  if(!ACC.length){ paint(); return; }
  BUSY=true;
  document.getElementById('ts').textContent='查询中…';
  var i=0, okc=0;
  function next(){
    if(i>=ACC.length){
      BUSY=false;
      document.getElementById('ts').textContent='更新于 '+hms();
      saveAll(); paint();
      return;
    }
    var a=ACC[i];
    queryOne(a, function(d){
      a.tryAt=hms();
      if(d && d.ret===0){
        var qb=(Number(d.qb_balance||0))/100, qd=(Number(d.qd_balance||0))/100;
        if(a.qb!==undefined && a.qb!==null && Math.abs(a.qb-qb)>0.004){
          a.delta=Math.round((qb-a.qb)*100)/100;
          a.deltaAt=mdhm();
          try{ showQbToast(a.nick||('账号'+(i+1)), a.qb, qb, a.delta); }catch(e){}   // ★ 2026-10-22 变化提示
        }
        a.qb=qb; a.qd=qd; a.err=''; okc++;
      } else {
        a.err = (d && d.msg) ? d.msg : '查询失败';
      }
      i++; next();
    });
  }
  next();
}

function hms(){ var d=new Date(); function p(n){return (n<10?'0':'')+n;} return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
function mdhm(){ var d=new Date(); function p(n){return (n<10?'0':'')+n;} return p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }

/* ---------- 渲染 ---------- */
function paint(){
  var ul=document.getElementById('list');
  // ★ 2026-10-22 重绘时保留「已展开」的账号（否则自动刷新一跑，明细就自己收起来）
  var _openU = {};
  try{
    var _lis0 = document.querySelectorAll('#list li');
    for(var _i0=0; _i0<_lis0.length; _i0++){
      if(_lis0[_i0].classList.contains('open')){ var _a0=ACC[_i0]; if(_a0 && _a0.uin) _openU[_a0.uin]=1; }
    }
  }catch(e){}
  var empty=document.getElementById('empty');
  empty.hidden = ACC.length>0;
  var h='', sqb=0, sqd=0;
  for(var i=0;i<ACC.length;i++){
    var a=ACC[i];
    if(a.qb!==undefined && a.qb!==null) sqb+=Number(a.qb);
    if(a.qd!==undefined && a.qd!==null) sqd+=Number(a.qd);
    h+='<li data-uin="'+esc(a.uin||'')+'"'+(_openU[a.uin]?' class="open"':'')+'><div class="row">';
    h+='<div class="who"><div class="name">'+esc(a.nick||('账号'+(i+1)))+'</div>';
    h+='<div class="uin">'+esc(maskUin(a.uin||''))+(a.delta?' · <b style="color:'+(a.delta>0?'#16873f':'#c0392b')+'">'+(a.delta>0?'▲ +':'▼ ')+a.delta.toFixed(2)+' '+esc(a.deltaAt||'')+'</b>':'')+'</div></div>';
    h+='<div class="amt"><div class="qb">'+(a.err?'—':f2(a.qb))+'</div><div class="qd">'+(a.err?'查询失败':(f2(a.qd)+' Q点'))+'</div></div>';
    if(a.err) h+='<span class="badge b-err">⚠ 查询失败</span>';
    h+='</div>';
    h+='<div class="det">';
    h+='<span>Q币 <span class="v">'+f2(a.qb)+'</span></span>';
    h+='<span>Q点 <span class="v">'+f2(a.qd)+'</span></span>';
    h+='<span>最近查询 <span class="v">'+esc(a.tryAt||'—')+'</span></span>';
    if(a.delta) h+='<span style="cursor:pointer" onclick="clearDelta('+i+')">清除变化</span>';
    h+='</div><div class="del-btn" data-i="'+i+'">删除</div></li>';
  }
  ul.innerHTML=h;
  document.getElementById('sqb').textContent=f2(Math.round(sqb*100)/100);
  document.getElementById('sqd').textContent=f2(Math.round(sqd*100)/100);
}
function clearDelta(i){ if(ACC[i]){ delete ACC[i].delta; delete ACC[i].deltaAt; saveAll(); paint(); } }

/* 2026-10-26 左滑删除账号 */
function delAccount(i){
  try{
    var a=ACC[i]; if(!a) return;
    var name=a.nick||a.uin||('账号'+(i+1));
    if(!confirm('删除账号「'+name+'」？\n只从这台手机移除（不影响小刀/电脑版）')) return;
    ACC.splice(i,1);
    saveAll();
    paint();
    if(window.AndroidBridge){ try{ AndroidBridge.setAccounts(JSON.stringify(ACC)); }catch(e){} }
  }catch(e){}
}
(function(){
  var startX=0,startY=0,cur=null;
  document.addEventListener('touchstart', function(e){
    try{
      if(!e.touches || e.touches.length!==1) return;
      var li=e.target.closest ? e.target.closest('#list li') : null;
      if(!li) return;
      startX=e.touches[0].clientX; startY=e.touches[0].clientY; cur=li;
    }catch(err){}
  }, {passive:true});
  document.addEventListener('touchmove', function(e){
    try{
      if(!cur || !e.touches || e.touches.length!==1) return;
      var dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
      if(Math.abs(dy)>Math.abs(dx)) return;
      if(dx<-35){ cur.classList.add('swiped'); }
      else if(dx>20){ cur.classList.remove('swiped'); }
    }catch(err){}
  }, {passive:true});
  document.addEventListener('click', function(e){
    try{
      var db=e.target.closest ? e.target.closest('.del-btn') : null;
      if(db){ var i=parseInt(db.getAttribute('data-i'),10); delAccount(i); return; }
      var sw=document.querySelectorAll('#list li.swiped');
      for(var k=0;k<sw.length;k++){ if(!sw[k].contains(e.target)) sw[k].classList.remove('swiped'); }
    }catch(err){}
  });
})();

/* 2026-10-26 长按拖动自由排序（修复：只能拖到最上/最下） */
window.__noClickUntil = 0;
(function(){
  var lpTimer=null, dragging=null, startPointerY=0, moved=false;
  function clearTimer(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
  document.addEventListener('touchstart', function(e){
    try{
      if(!e.touches || e.touches.length!==1) return;
      if(e.target.closest && e.target.closest('.del-btn')) return;
      var li=e.target.closest ? e.target.closest('#list li') : null;
      if(!li) return;
      moved=false; startPointerY=e.touches[0].clientY;
      clearTimer();
      var target=li;
      lpTimer=setTimeout(function(){
        lpTimer=null;
        if(moved || !target) return;
        dragging=target;
        dragging.classList.add('dragging');
        try{ if(navigator.vibrate) navigator.vibrate(15); }catch(err){}
      }, 450);
    }catch(err){}
  }, {passive:true});
  document.addEventListener('touchmove', function(e){
    try{
      if(!e.touches || e.touches.length!==1) return;
      var y=e.touches[0].clientY;
      if(!dragging){
        if(Math.abs(y-startPointerY)>12){ moved=true; clearTimer(); }
        return;
      }
      if(e.cancelable) e.preventDefault();
      var list=document.getElementById('list');
      var kids=[]; for(var i=0;i<list.children.length;i++){ var el=list.children[i]; if(el!==dragging) kids.push(el); }
      var target=null;
      for(var k=0;k<kids.length;k++){
        var r=kids[k].getBoundingClientRect();
        if(y < r.top + r.height/2){ target=kids[k]; break; }
      }
      if(target){
        if(dragging.nextElementSibling!==target) list.insertBefore(dragging, target);
      } else {
        if(list.lastElementChild!==dragging) list.appendChild(dragging);
      }
      // 让卡片视觉上跟着手指（相对当前实际位置）
      var rr=dragging.getBoundingClientRect();
      dragging.style.transform='translateY('+(y-(rr.top+rr.height/2))+'px)';
    }catch(err){}
  }, {passive:false});
  document.addEventListener('touchend', function(){
    try{
      clearTimer();
      if(!dragging) return;
      dragging.style.transform='';
      dragging.classList.remove('dragging');
      var lis=document.querySelectorAll('#list li');
      var map={}; for(var i=0;i<ACC.length;i++) map[String(ACC[i].uin)]=ACC[i];
      var order=[];
      for(var k=0;k<lis.length;k++){ var u=lis[k].getAttribute('data-uin'); if(u && map[u]) order.push(map[u]); }
      if(order.length===ACC.length){
        ACC=order; lss(KEY_SORT,'default'); saveAll();
        if(window.AndroidBridge){ try{ AndroidBridge.setAccounts(JSON.stringify(ACC)); }catch(err){} }
      }
      dragging=null;
      window.__noClickUntil=Date.now()+500;
      try{ paint(); }catch(err){}
    }catch(err){}
  }, {passive:true});
})();
function toggleUin(){
  HIDE=!HIDE; lss(KEY_HIDE,HIDE);
  document.getElementById('uinbtn').textContent=HIDE?'显示QQ号':'隐藏QQ号';
  paint();
}

/* ---------- 导入 ---------- */
function openImport(){
  document.getElementById('importText').value='';
  document.getElementById('importBox').hidden=false;
}
function closeImport(){ document.getElementById('importBox').hidden=true; }
function doImport(){
  var raw=document.getElementById('importText').value||'';
  var lines=raw.split(/\r?\n/);
  var added=0, updated=0;
  for(var i=0;i<lines.length;i++){
    var ln=lines[i].trim();
    if(!ln) continue;
    var p=ln.split('|');
    var nick='', uin='', oid='', okey='';
    if(p.length>=4){ nick=p[0].trim(); uin=p[1].trim(); oid=p[2].trim(); okey=p[3].trim(); }
    else {
      var m1=/openid=([0-9A-Za-z]+)/.exec(ln), m2=/openkey=([0-9A-Za-z]+)/.exec(ln);
      if(!m1||!m2) continue;
      oid=m1[1]; okey=m2[1];
      var mu=/[?&]uin=([0-9]+)/.exec(ln); if(mu) uin=mu[1];
    }
    if(!oid||!okey) continue;
    var found=null;
    for(var j=0;j<ACC.length;j++) if(ACC[j].openid===oid) { found=ACC[j]; break; }
    if(found){ found.nick=nick||found.nick; found.uin=uin||found.uin; found.openkey=okey; updated++; }
    else { ACC.push({nick:nick,uin:uin,openid:oid,openkey:okey}); added++; }
  }
  saveAll();
  closeImport();
  paint();
  if(added+updated>0){ refreshAll(); }
  else { alert('没有识别到有效内容。\n请用电脑版「右键 → 复制全部 CK」复制后再粘贴。'); }
}

/* ---------- 下拉刷新 ---------- */
var ptStart=0, ptPull=0, ptOn=false, ptBarEl=null;
function ptBar(show,text,color){
  if(!ptBarEl) ptBarEl=document.getElementById('ptbar');
  if(text) ptBarEl.textContent=text;
  ptBarEl.style.background=color||'#1c589e';
  ptBarEl.style.transform=show?'translateY(0)':'translateY(-100%)';
}
function atTop(){ return (window.pageYOffset||document.documentElement.scrollTop||0)<=0; }
document.addEventListener('touchstart',function(e){ if(e.touches.length!==1)return; ptStart=e.touches[0].clientY; ptPull=0; ptOn=atTop(); },{passive:true});
document.addEventListener('touchmove',function(e){
  if(!ptOn||e.touches.length!==1)return;
  var dy=e.touches[0].clientY-ptStart;
  if(dy<=0){ if(ptPull>0){ptPull=0;ptBar(false);} return; }
  if(!atTop()){ ptOn=false; ptBar(false); return; }
  ptPull=dy;
  ptBar(true, dy>70?'松开手就刷新':'下拉可以刷新', dy>70?'#16873f':'#1c589e');
  if(e.cancelable) e.preventDefault();
},{passive:false});
document.addEventListener('touchend',function(){ if(!ptOn)return; var dy=ptPull; ptOn=false; ptPull=0; if(dy>70){ ptBar(true,'正在刷新…'); refreshAll(); setTimeout(function(){ptBar(false);},1200); } else ptBar(false); },{passive:true});

/* ---------- 一键导入链接（#d=<base64>）：手机点开链接自动导入 CK ---------- */
/* 2026-10-23 旧的多用户链接（?u=&k=）已废弃 → 提示改用一键导入链接 */
function warnOldUserLink(){
  try{
    if (!/^[?&]?u=/.test(location.search.replace('?',''))) return false;
    var sp = new URLSearchParams(location.search);
    if (!sp.get('u')) return false;
    if (typeof ACC !== 'undefined' && ACC && ACC.length) return false;
    setTimeout(function(){
      try{ alert('这个链接是旧格式（?u=），已经不用了。\n\n请改用「一键导入链接」（#d=...）打开，会自动导入账号和钥匙。'); }catch(e){}
    }, 800);
    return true;
  }catch(e){ return false; }
}
function importFromHash(){
  try{
    if(!location.hash || location.hash.indexOf('#d=')!==0) return false;
    var rawHash = location.hash.substring(1);   // d=...&k=...
    var parts = rawHash.split('&');
    var dVal = '', kVal = '';
    for (var hi = 0; hi < parts.length; hi++) {
      var kv = parts[hi].split('=');
      if (kv[0] === 'd') dVal = kv.slice(1).join('=');
      if (kv[0] === 'k') kVal = kv.slice(1).join('=');
    }
    if (kVal) { lss('qbstd_key_v1', kVal); }
    var b64=decodeURIComponent(dVal);
    var txt=decodeURIComponent(escape(atob(b64)));
    document.getElementById('importText').value=txt;
    doImport();
    try{ history.replaceState(null,'',location.pathname); }catch(e){}
    return true;
  }catch(e){ return false; }
}

/* ---------- 启动 ---------- */
loadAll();
paint();
importFromHash();
refreshAll();
IV = getIV(); startTimer();
document.addEventListener('visibilitychange',function(){ if(!document.hidden){ var t=document.getElementById('ts').textContent; if(t.indexOf('更新于')<0) refreshAll(); } });

/* ---------- 设置面板（2026-10-17 按用户要求把电脑版手机端的设置搬过来） ---------- */
var KEY_IV='qbstd_iv_v1', IV=5, _timer=null;
function getIV(){ var v=Number(ls(KEY_IV,5)); return (v>=1&&v<=60)?v:5; }
function startTimer(){ if(_timer) clearInterval(_timer); _timer=setInterval(function(){ if(!document.hidden) refreshAll(); }, IV*60*1000); }
function openSettings(){
  document.getElementById('ivSel').value=String(IV);
  document.getElementById('hideChk').checked=HIDE;
  try{ var qc=document.getElementById('qbTipChk'); if(qc) qc.checked=qbTipOn(); }catch(e){}
  try{ var ss=document.getElementById('sortSel'); if(ss) ss.value=sortKind(); }catch(e){}
  try{ var ki=document.getElementById('keyInp'); if(ki) ki.value=(localStorage.getItem('qbstd_key_v1')||''); }catch(e){}
  try{ var kw=document.getElementById('keyWrap'); if(kw && window.AndroidBridge) kw.style.display='none'; }catch(e){}
  try{ var wc=document.getElementById('watchChk'); if(wc){ wc.checked=!!(window.AndroidBridge && AndroidBridge.getWatch && AndroidBridge.getWatch()); } }catch(e){}
  try{ var wr=document.getElementById('watchRow'); if(wr) wr.style.display = window.AndroidBridge ? 'flex' : 'none'; }catch(e){}
  setTimeout(refreshNotifyTip, 200);
  document.getElementById('setCnt').textContent=ACC.length;

  var last='—'; for(var i=0;i<ACC.length;i++){ if(ACC[i].tryAt){ last=ACC[i].tryAt; break; } }
  document.getElementById('setLast').textContent=last;
  document.getElementById('setBox').hidden=false;
}
function closeSettings(){
  var v=Number(document.getElementById('ivSel').value)||5;
  IV=v; lss(KEY_IV,v); startTimer();
  document.getElementById('setBox').hidden=true;
  document.getElementById('ts').textContent='刷新间隔已设为 '+IV+' 分钟';
  setTimeout(function(){ if(!BUSY){ var d=new Date(); function p(n){return (n<10?'0':'')+n;} document.getElementById('ts').textContent='更新于 '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); } }, 1500);
}
/* 2026-10-22：QB 余额变化提示（顶部横幅，10 秒自动消失，最多同时 3 条） */
var KEY_QBTIP='qbstd_qbtip_v1';
function qbTipOn(){ var v=ls(KEY_QBTIP,true); return v!==false && v!=='0'; }
function setQbTip(v){ lss(KEY_QBTIP,!!v); }
/* 2026-10-26 排列顺序 */
var KEY_SORT='qbstd_sort_v1';
function sortKind(){ return ls(KEY_SORT,'default'); }
function applySort(kind){
  try{
    lss(KEY_SORT, kind || 'default');
    var st = (typeof SITE!=='undefined') ? SITE : {};
    function num(x){ return (x===undefined||x===null||isNaN(x)) ? null : Number(x); }
    if(kind==='qbDesc'||kind==='qbAsc'){
      ACC.sort(function(p,q){
        var a=num(p.qb), b=num(q.qb);
        if(a===null && b===null) return 0;
        if(a===null) return 1;
        if(b===null) return -1;
        return kind==='qbDesc' ? (b-a) : (a-b);
      });
    } else if(kind==='nextAsc'){
      function nk(a){ var s=st[a.uin]||{}; return (typeof s.nextWxAt==='number') ? (s.nextWxAt===0 ? 1 : s.nextWxAt) : 9e15; }
      ACC.sort(function(p,q){ return nk(p)-nk(q); });
    } else if(kind==='wxDesc'){
      function wk(a){ var s=st[a.uin]||{}; return (typeof s.wx7==='number') ? s.wx7 : -1; }
      ACC.sort(function(p,q){ return wk(q)-wk(p); });
    } else if(kind==='nameAsc'){
      ACC.sort(function(p,q){ return String(p.nick||p.uin||'').localeCompare(String(q.nick||q.uin||''), 'zh-Hans-CN'); });
    }
    saveAll();
    paint();
    if(window.AndroidBridge){ try{ AndroidBridge.setAccounts(JSON.stringify(ACC)); }catch(e){} }
  }catch(e){}
}
/* 2026-10-23 复制给 iOS 快捷指令用的账号配置（JSON） */
/* 一键安装快捷指令：建好后把 iCloud 分享链接填到下行的引号里 */
var IC_SHORTCUT_URL = '';
function installShortcut(){
  try{
    if (!IC_SHORTCUT_URL) { alert('快捷指令还没生成（需要在一台 iPhone 上建一次并分享 iCloud 链接）'); return; }
    location.href = IC_SHORTCUT_URL;
  }catch(e){}
}function copyShortcutConfig(){
  try{
    var arr = [];
    for (var i=0;i<ACC.length;i++){ var a=ACC[i]; if(a && a.openid && a.openkey) arr.push({n:a.nick||'', u:a.uin||'', o:a.openid, k:a.openkey}); }
    var txt = JSON.stringify(arr);
    var tip = document.getElementById('scTip');
    function ok(){ if(tip){ tip.style.color='#16873f'; tip.textContent='已复制 ' + arr.length + ' 个账号配置 ✓ 去快捷指令里粘贴'; } }
    if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(ok, function(){ fallback(); }); } else { fallback(); }
    function fallback(){
      var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); ok(); }catch(e){ if(tip){ tip.style.color='#c0392b'; tip.textContent='复制失败，长按下面内容手动复制'; } }
      document.body.removeChild(ta);
    }
  }catch(e){}
}
/* 2026-10-22 数据钥匙：填了就能用自己仓库的 data.json 秒开 */
function saveDataKey(){
  try{
    var v=(document.getElementById('keyInp').value||'').trim().toLowerCase();
    var tip=document.getElementById('keyTip');
    if(v.length===0){ localStorage.removeItem('qbstd_key_v1'); tip.style.color='#c0392b'; tip.textContent='已清空钥匙（会走实时查询）'; setTimeout(function(){location.reload();},800); return; }
    if(!/^[0-9a-f]{64}$/.test(v)){ tip.style.color='#c0392b'; tip.textContent='格式不对：要 64 位十六进制'; return; }
    localStorage.setItem('qbstd_key_v1', v);
    tip.style.color='#16873f'; tip.textContent='已保存 ✓ 正在重新加载…';
    setTimeout(function(){ location.reload(); }, 700);
  }catch(e){}
}
/* 2026-10-22 安卓后台监控（锁屏通知）*/
function dlApp(){ try{ location.href='qbpanel.apk'; }catch(e){} }
function setWatchOn(v){
  try{
    if(!window.AndroidBridge){ alert('网页版做不到后台通知（浏览器限制）。\n安卓请点上面「下载安卓 App」（装好后关掉也会后台更新 + 锁屏通知）\niPhone 用「快捷指令」每小时后台查 + 通知'); return; }
    if(v){ AndroidBridge.setWatch(true); AndroidBridge.requestNotifyPermission(); }
    else { AndroidBridge.setWatch(false); }
    setTimeout(refreshNotifyTip, 900);
  }catch(e){}
}
function refreshNotifyTip(){
  try{
    var tip=document.getElementById('notifyTip'); if(!tip) return;
    var ok = !window.AndroidBridge ? false : !!AndroidBridge.notifyEnabled();
    tip.style.display = ok ? 'none' : 'block';
  }catch(e){}
}
function openNotifySetting(){ try{ if(window.AndroidBridge) AndroidBridge.openNotifySettings(); }catch(e){} }
function testLockNotify(){
  try{
    if(!window.AndroidBridge){ alert('网页版做不到后台通知（浏览器限制）。\n安卓请点上面「下载安卓 App」（装好后关掉也会后台更新 + 锁屏通知）\niPhone 用「快捷指令」每小时后台查 + 通知'); return; }
    AndroidBridge.requestNotifyPermission();
    setTimeout(function(){ try{ AndroidBridge.testNotify(); }catch(e){} }, 700);
  }catch(e){}
}
function showQbToast(nick, oldQb, newQb, delta){
  if(!qbTipOn()) return;
  try{
    var box=document.getElementById('qbToast'); if(!box) return;
    var d=Number(delta||0);
    var el=document.createElement('div'); el.className='qbt';
    el.innerHTML='💰 <b>'+esc(nick||'')+'</b> QB 余额变化　'+f2(oldQb)+' → <b>'+f2(newQb)+'</b> '
      + (d>0?'<b>▲ +'+d.toFixed(2)+'</b>':'<b style="color:#ff9b9b">▼ '+d.toFixed(2)+'</b>')
      + '　<em>'+hms()+'</em>';
    box.appendChild(el);
    while(box.children.length>3) box.removeChild(box.firstChild);
    setTimeout(function(){ try{ el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(function(){ el.remove(); },450); }catch(e){} }, 10000);
  }catch(e){}
}
function setHide(v){ HIDE=!!v; lss(KEY_HIDE,HIDE); document.getElementById('uinbtn').textContent=HIDE?'显示QQ号':'隐藏QQ号'; paint(); }

function clearAllChanges(){
  for(var i=0;i<ACC.length;i++){ delete ACC[i].delta; delete ACC[i].deltaAt; }
  saveAll(); paint(); closeSettings();
}

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
