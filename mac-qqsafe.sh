#!/bin/bash
# QQ安全中心 令牌秘钥提取（Apple Silicon Mac 一键脚本 · 无需 Java 版）
# 用法：curl -fL -o /tmp/mac.sh "https://www.qbmobile.icu/mac-qqsafe.sh?v=3" && bash /tmp/mac.sh
set -e

BASE="https://www.qbmobile.icu"
WORK="$HOME/qqsafe-tool"
SDK="$WORK/android-sdk"
AVD="qqsafe"
EMU_ZIP_URL="https://dl.google.com/android/repository/emulator-darwin_aarch64-16632760.zip"
SYS_ZIP_URL="https://dl.google.com/android/repository/sys-img/google_apis/arm64-v8a-33_r17.zip"
PT_ZIP_URL="https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"

say() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }
err() { printf "\n\033[1;31m!! %s\033[0m\n" "$*"; }
dl() { curl -fL --retry 3 --connect-timeout 20 -m 1800 -o "$2" "$1"; }

say "1/9 检查环境"
ARCH="$(uname -m)"
echo "CPU 架构: $ARCH"
if [ "$ARCH" != "arm64" ]; then
  err "这台不是 Apple Silicon（arm64），Intel Mac 跑不了 arm64 模拟器。"
  exit 1
fi
mkdir -p "$WORK" "$SDK"
cd "$WORK"
if ! command -v python3 >/dev/null 2>&1; then
  err "缺少 python3。请先安装 Xcode 命令行工具：xcode-select --install，装完重跑本脚本。"
  exit 1
fi

say "2/9 下载 platform-tools（adb）"
if [ ! -x "$SDK/platform-tools/adb" ]; then
  [ -f "$WORK/pt.zip" ] || dl "$PT_ZIP_URL" "$WORK/pt.zip"
  rm -rf "$WORK/pt_tmp"; mkdir -p "$WORK/pt_tmp"
  unzip -oq "$WORK/pt.zip" -d "$WORK/pt_tmp"
  mkdir -p "$SDK"
  rm -rf "$SDK/platform-tools"
  mv "$WORK/pt_tmp/platform-tools" "$SDK/platform-tools"
fi
ADB="$SDK/platform-tools/adb"
echo "adb: $ADB"

say "3/9 下载 emulator（arm64 原生版，约 400MB）"
if [ ! -x "$SDK/emulator/emulator" ]; then
  [ -f "$WORK/emu.zip" ] || dl "$EMU_ZIP_URL" "$WORK/emu.zip"
  rm -rf "$WORK/emu_tmp"; mkdir -p "$WORK/emu_tmp"
  unzip -oq "$WORK/emu.zip" -d "$WORK/emu_tmp"
  if [ -d "$WORK/emu_tmp/emulator" ]; then rm -rf "$SDK/emulator"; mv "$WORK/emu_tmp/emulator" "$SDK/emulator"; fi
fi
EMU="$SDK/emulator/emulator"
[ -x "$EMU" ] || { err "emulator 解压失败"; exit 1; }

say "4/9 下载系统镜像 Android 13 arm64（约 1.2GB，耐心等）"
IMG_DIR="$SDK/system-images/android-33/google_apis/arm64-v8a"
if [ ! -f "$IMG_DIR/system.img" ] && [ ! -f "$IMG_DIR/system-qemu.img" ]; then
  [ -f "$WORK/sys.zip" ] || dl "$SYS_ZIP_URL" "$WORK/sys.zip"
  rm -rf "$WORK/sys_tmp"; mkdir -p "$WORK/sys_tmp"
  unzip -oq "$WORK/sys.zip" -d "$WORK/sys_tmp"
  mkdir -p "$IMG_DIR"
  if [ -d "$WORK/sys_tmp/arm64-v8a" ]; then
    cp -R "$WORK/sys_tmp/arm64-v8a/." "$IMG_DIR/"
  else
    cp -R "$WORK/sys_tmp/." "$IMG_DIR/"
  fi
fi
ls "$IMG_DIR" | head -5

say "5/9 创建 AVD（手工配置，不需要 Java）"
AVD_HOME="$HOME/.android/avd"
mkdir -p "$AVD_HOME/$AVD.avd"
cat > "$AVD_HOME/$AVD.avd/config.ini" <<EOF
avd.ini.encoding=UTF-8
AvdId=$AVD
avd.name=$AVD
abi.type=arm64-v8a
hw.cpu.arch=arm64
hw.ramSize=2048
hw.lcd.width=720
hw.lcd.height=1280
hw.lcd.density=240
hw.gpu.enabled=yes
hw.gpu.mode=auto
hw.keyboard=yes
hw.sdCard=no
disk.dataPartition.size=4G
image.sysdir.1=system-images/android-33/google_apis/arm64-v8a/
tag.id=google_apis
tag.display=Google APIs
PlayStore.enabled=no
EOF
cat > "$AVD_HOME/$AVD.ini" <<EOF
avd.ini.encoding=UTF-8
AvdId=$AVD
path=$AVD_HOME/$AVD.avd
path.rel=avd/$AVD.avd
target=android-33
abi.type=arm64-v8a
EOF
[ -f "$IMG_DIR/userdata.img" ] && cp -f "$IMG_DIR/userdata.img" "$AVD_HOME/$AVD.avd/userdata.img" || true

say "6/9 启动模拟器（第一次开机 1-3 分钟）"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
if ! "$ADB" devices 2>/dev/null | grep -q "^emulator-"; then
  nohup "$EMU" -avd "$AVD" -no-snapshot -no-audio -no-boot-anim >/tmp/qqsafe-emulator.log 2>&1 &
  sleep 8
fi
echo "等待开机..."
BOOT=""
for i in $(seq 1 120); do
  BOOT=$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  if [ "$BOOT" = "1" ]; then echo "模拟器已开机"; break; fi
  sleep 5
  if [ $((i % 6)) -eq 0 ]; then echo "  ...还在开机（$((i*5)) 秒）"; fi
done

say "7/9 获取 root 并安装 QQ安全中心"
"$ADB" root >/dev/null 2>&1 || true
sleep 3
"$ADB" wait-for-device
if [ ! -f "$WORK/qqsafe.apk" ]; then
  dl "$BASE/qq-safe-app.apk" "$WORK/qqsafe.apk"
fi
"$ADB" install -r "$WORK/qqsafe.apk" 2>&1 | tail -2

say "8/9 部署 frida-server"
if [ ! -f "$WORK/frida-server" ]; then
  dl "$BASE/frida-server-android-arm64" "$WORK/frida-server"
fi
chmod +x "$WORK/frida-server"
"$ADB" push "$WORK/frida-server" /data/local/tmp/frida-server >/dev/null 2>&1
"$ADB" shell chmod 755 /data/local/tmp/frida-server
"$ADB" shell "pkill -f frida-server 2>/dev/null; nohup /data/local/tmp/frida-server -l 127.0.0.1:27042 >/data/local/tmp/fs.log 2>&1 &" >/dev/null 2>&1 || true
sleep 3
"$ADB" forward tcp:27042 tcp:27042 >/dev/null
echo "frida-server 已启动"

say "9/9 安装 frida 客户端（Mac 本地）"
python3 -m pip install --user --quiet "frida==16.7.19" 2>/dev/null || \
python3 -m pip install --user --quiet --break-system-packages "frida==16.7.19" 2>/dev/null || \
python3 -m pip install --quiet --break-system-packages "frida==16.7.19" || {
  err "frida 安装失败，请把报错发我"; exit 1; }

cat > "$WORK/capture.py" <<'PYEOF'
import frida, time, json

LOG = '/tmp/qqsafe-capture.log'
SCRIPT = r'''
function bytesToHex(a){
  var n = Math.min(a.length, 160), s='';
  for(var i=0;i<n;i++){ var v=(a[i]&0xff).toString(16); if(v.length<2) v='0'+v; s+=v; }
  return s;
}
Java.perform(function(){
  var Cipher = Java.use('javax.crypto.Cipher');
  var ovs = Cipher.doFinal.overloads;
  for (var i=0;i<ovs.length;i++){
    (function(ov){
      ov.implementation = function(){
        var args = Array.prototype.slice.call(arguments);
        var res = ov.call.apply(ov, [this].concat(args));
        try{
          var inHex='', outHex='';
          if (args.length>=1 && args[0]!==null && args[0].length!==undefined) inHex = bytesToHex(args[0]);
          if (res && res.length!==undefined) outHex = bytesToHex(res);
          send({t:'cipher', algo:String(this.getAlgorithm()), inHex:inHex, outHex:outHex});
        }catch(e){}
        return res;
      };
    })(ovs[i]);
  }
  try{
    var MD = Java.use('java.security.MessageDigest');
    var d = MD.digest.overload();
    d.implementation = function(){
      var r = d.call(this);
      try{ send({t:'digest', algo:String(this.getAlgorithm()), outHex: bytesToHex(r)}); }catch(e){}
      return r;
    };
  }catch(e){}
  send({t:'ready'});
});
'''

def on_message(msg, data):
    try:
        if msg.get('type') == 'send':
            with open(LOG, 'a') as f:
                f.write(json.dumps(msg.get('payload'), ensure_ascii=False) + '\n')
    except Exception:
        pass

def main():
    open(LOG, 'w').close()
    dev = frida.get_device_manager().add_remote_device('127.0.0.1:27042')
    print('正在启动 QQ安全中心 ...')
    pid = dev.spawn(['com.tencent.token'])
    session = dev.attach(pid)
    script = session.create_script(SCRIPT)
    script.on('message', on_message)
    script.load()
    dev.resume(pid)
    print('\n=========== HOOK 已装好 ===========')
    print('现在请在模拟器里：')
    print('  1) 打开 QQ安全中心 → 同意协议')
    print('  2) 点「登录QQ」→ 用手机QQ 扫码登录')
    print('  3) 进入「QQ手机令牌」→ 开启/绑定令牌')
    print('  4) 绑定成功出现 6 位动态码')
    print('下方会实时打印抓到的解密数据（含 outHex）：\n')
    last = 0
    while True:
        try:
            with open(LOG) as f:
                lines = f.readlines()
            for line in lines[last:]:
                last += 1
                print(line.rstrip()[:500])
        except Exception:
            pass
        time.sleep(1)

if __name__ == '__main__':
    main()
PYEOF

say "准备完成！即将开始抓取"
echo "================================================================"
echo "接下来在【模拟器窗口】里操作："
echo "  1) 打开 QQ安全中心 → 同意协议"
echo "  2) 点「登录QQ」→ 手机QQ 扫码登录"
echo "  3) 进入「QQ手机令牌」→ 开启/绑定令牌"
echo "  4) 出现 6 位动态码 = 成功"
echo
echo "本窗口会打印抓到的数据；绑定成功后把最后 30 行发我即可。"
echo "================================================================"
sleep 3
cd "$WORK" && exec python3 capture.py
