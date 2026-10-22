
/* ---------- 全局错误捕获：出错时直接在页面显示原因（方便远程排查） ---------- */
(function(){
  var shown = 0;
  function showErr(msg, extra){
    if (shown > 4) return;
    shown++;
    var bar = document.getElementById('errbar');
    if (!bar) return;
    bar.style.display = 'block';
    bar.textContent += '⚠ 页面出错：' + msg + (extra ? ('\n' + extra) : '') + '\n';
    try { var ts = document.getElementById('ts'); if (ts) ts.textContent = '运行出错（看顶部提示）'; } catch(e){}
  }
  window.addEventListener('error', function(e){
    var m = (e && e.message) ? e.message : '未知错误';
    var where = (e && e.filename ? e.filename.split('/').pop() : '') + (e && e.lineno ? (':' + e.lineno) : '');
    showErr(m, where);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    showErr('异步错误：' + (r && (r.message || r)), '');
  });
  // 兜底：如果 8 秒后页面还停在"正在读取"，也提示一下
  setTimeout(function(){
    try {
      var ts = document.getElementById('ts');
      // ★ 没有账号/没有钥匙 = 正常闲置状态，不报错（2026-10-18）
      if (!hasDataKey() || !ACC || ACC.length === 0) return;
      if (ts && ts.textContent.indexOf('读取') >= 0) {
        showErr('页面卡在"正在读取"（可能是浏览器太旧/网络被拦）', '当前 UA: ' + (navigator.userAgent || '').slice(0, 120));
      }
    } catch(e){}
  }, 8000);
})();
