
(function(){
  // ★ 和电脑版完全相同的签发者公钥（ECDSA P-256，CNG EccPublicBlob 格式的 base64）
  var PUB_B64 = 'RUNTMSAAAABFIiRH9Hvin1ew4wXIhiGWmCUvaciVExZKh+iHnbNlKJwcvNuo8EcIUublTz7qV1zFq5kgdP6Uu16ladXerIFx';
  var LIC_KEY = 'qbstd_lic_v1';
  var DEV_KEY = 'qbstd_dev_v1';

  function b64ToBytes(s){
    s = s.replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function b64url(bytes){
    var bin = '';
    for (var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  // ★ 设备指纹：由 浏览器/屏幕/时区/语言/CPU 核数/像素比 算出来
  //   清浏览器数据、清缓存都不会变（只有换浏览器/换设备/系统大版本升级才会变）
  function devId(){
    var cached = localStorage.getItem(DEV_KEY);
    if (cached && cached.length >= 20) return cached;
    var fp = [
      navigator.userAgent || '',
      (screen.width || 0) + 'x' + (screen.height || 0) + 'x' + (screen.colorDepth || 0),
      (new Date()).getTimezoneOffset(),
      navigator.language || '',
      navigator.languages ? navigator.languages.join(',') : '',
      navigator.hardwareConcurrency || 0,
      window.devicePixelRatio || 1,
      navigator.platform || ''
    ].join('|');
    // 稳定的 53 位哈希（两次不同位宽混合，降低碰撞）
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < fp.length; i++) {
      var ch = fp.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
      h2 = Math.imul(h2 + ch, 2654435761) >>> 0;
    }
    var v = 'fp-' + h1.toString(36) + '-' + h2.toString(36) + '-' + fp.length.toString(36);
    try { localStorage.setItem(DEV_KEY, v); } catch(e){}
    return v;
  }
  function machineCode(){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('QBLic2|web:' + devId())).then(function(buf){
      var h = new Uint8Array(buf), s = '';
      for (var i=0;i<8;i++) s += ('0' + h[i].toString(16)).slice(-2);
      s = s.toUpperCase();
      return s.slice(0,4)+'-'+s.slice(4,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16);
    });
  }
  function pubKey(){
    var b = b64ToBytes(PUB_B64);            // 72 bytes: magic(4) cbKey(4) X(32) Y(32)
    var jwk = { kty:'EC', crv:'P-256', x: b64url(b.slice(8,40)), y: b64url(b.slice(40,72)) };
    return crypto.subtle.importKey('jwk', jwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
  }
  function verifyLicense(code, mc){
    code = (code||'').trim();
    var parts = code.split('.');
    if (parts.length !== 2) return Promise.resolve('授权码格式不对（是不是复制少了一段？）');
    var payload, sig, f;
    try {
      payload = new TextDecoder().decode(b64ToBytes(parts[0]));
      sig = b64ToBytes(parts[1]);
      f = payload.split('|');
    } catch(e){ return Promise.resolve('授权码格式不对'); }
    if (f[0] !== 'QB1') return Promise.resolve('授权码格式不对');
    var licMc = (f[1] || '').toUpperCase();
    if (licMc !== '*' && licMc !== mc) return Promise.resolve('这个授权码不是给这台设备的');
    if (f[2]) {
      var e = f[2];
      var exp = new Date(Number(e.slice(0,4)), Number(e.slice(4,6))-1, Number(e.slice(6,8)));
      var today = new Date(); today.setHours(0,0,0,0);
      if (exp < today) return Promise.resolve('授权已过期（' + e + '）');
    }
    return pubKey().then(function(key){
      return crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, key, sig, new TextEncoder().encode(payload));
    }).then(function(ok){ return ok ? '' : '授权码无效（签名不对）'; })
      .catch(function(){ return '浏览器不支持验证，请换 Chrome/Safari 新版'; });
  }

  window.copyMC = function(){
    var t = document.getElementById('mc').textContent;
    try { navigator.clipboard.writeText(t); } catch(e){}
    document.getElementById('licErr').textContent = '机器码已复制 ✓';
    document.getElementById('licErr').style.color = '#16873f';
  };
  window.doActivate = function(){
    var code = document.getElementById('licInp').value || '';
    var errEl = document.getElementById('licErr');
    errEl.style.color = '#c0392b';
    machineCode().then(function(mc){
      return verifyLicense(code, mc).then(function(err){
        if (err) { errEl.textContent = err; return; }
        localStorage.setItem(LIC_KEY, code.trim());
        errEl.style.color = '#16873f';
        errEl.textContent = '激活成功 ✅';
        document.getElementById('lic').style.display = 'none';
        try { refreshAll(); } catch(e){}
      });
    });
  };

  // 启动：检查已保存的授权
  machineCode().then(function(mc){
    var el = document.getElementById('mc');
    if (el) el.textContent = mc;
    var saved = localStorage.getItem(LIC_KEY) || '';
    if (saved) {
      verifyLicense(saved, mc).then(function(err){
        if (!err) { document.getElementById('lic').style.display = 'none'; }
      });
    }
  });
})();
