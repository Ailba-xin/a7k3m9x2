import time
import re
import sys

try:
    import frida
except ImportError:
    print('NO_FRIDA: pip3 install --break-system-packages frida==16.7.19')
    sys.exit(1)

APP = 'com.tencent.token'
ADDR = '127.0.0.1:27042'

JS = r'''
function hex(a, n) {
  var s = '';
  var lim = Math.min(a.length, n || 64);
  for (var i = 0; i < lim; i++) {
    var v = (a[i] + 256) % 256;
    s += ('0' + v.toString(16)).slice(-2);
  }
  return s + (a.length > (n || 64) ? '..len' + a.length : '');
}

Java.perform(function () {
  try {
    var SB = Java.use('java.lang.StringBuilder');
    var ts = SB.toString;
    ts.implementation = function () {
      var r = ts.call(this);
      try {
        if (r && r.indexOf('QQTokenHomePageView') >= 0 && r.indexOf('token = ') >= 0) {
          var m = r.match(/token = (\d{6})/);
          if (m) send({ kind: 'CODE', code: m[1] });
        }
      } catch (e) { }
      return r;
    };
    console.log('[OK] StringBuilder');
  } catch (e) { console.log('[FAIL] SB ' + e); }

  try {
    var C = Java.use('javax.crypto.Cipher');
    var df = C.doFinal.overload('[B');
    df.implementation = function (inp) {
      var out = df.call(this, inp);
      try {
        var alg = this.getAlgorithm();
        if (alg.indexOf('AES') >= 0 || alg.indexOf('RSA') >= 0) {
          send({
            kind: 'CIPHER', alg: alg,
            inlen: inp.length, inhex: hex(inp, 48),
            outlen: out.length, outhex: hex(out, 48)
          });
        }
      } catch (e) { }
      return out;
    };
    console.log('[OK] Cipher');
  } catch (e) { console.log('[FAIL] Cipher ' + e); }

  try {
    var SKS = Java.use('javax.crypto.spec.SecretKeySpec');
    SKS.$init.overload('[B', 'java.lang.String').implementation = function (k, alg) {
      send({ kind: 'KEY', alg: alg, len: k.length, hex: hex(k, 64) });
      return this.$init(k, alg);
    };
    console.log('[OK] SecretKeySpec');
  } catch (e) { console.log('[FAIL] SKS ' + e); }
});
'''

def on_message(msg, data):
    try:
        if msg['type'] == 'send':
            p = msg['payload']
            k = p.get('kind')
            if k == 'CODE':
                print('CODE ' + p['code'], flush=True)
            elif k == 'KEY':
                print('KEY alg=' + str(p['alg']) + ' len=' + str(p['len']) + ' hex=' + p['hex'], flush=True)
            elif k == 'CIPHER':
                print('CIPHER ' + p['alg'] + ' in=' + p['inhex'] + ' out=' + p['outhex'], flush=True)
        elif msg['type'] == 'log':
            print('LOG ' + str(msg.get('payload'))[:300], flush=True)
        elif msg['type'] == 'error':
            print('ERR ' + str(msg.get('description')), flush=True)
    except Exception as e:
        print('H ' + str(e), flush=True)

def main():
    dev = frida.get_device_manager().add_remote_device(ADDR)
    print('device ok', flush=True)
    pid = None
    for i in range(30):
        for a in dev.enumerate_applications():
            if a.identifier == APP and a.pid > 0:
                pid = a.pid
                break
        if pid:
            break
        time.sleep(1)
    print('pid=' + str(pid), flush=True)
    if not pid:
        print('APP_NOT_RUNNING', flush=True)
        return
    sess = dev.attach(pid)
    sc = sess.create_script(JS)
    sc.on('message', on_message)
    sc.load()
    print('WATCHING (600s)', flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(5)
    print('done', flush=True)

if __name__ == '__main__':
    main()
