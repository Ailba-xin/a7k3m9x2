#!/bin/bash
# QQ安全中心 令牌秘钥提取（Apple Silicon Mac 一键脚本）
# 用法：curl -fsSL https://www.qbmobile.icu/mac-qqsafe.sh | bash
set -e

BASE="https://www.qbmobile.icu"
WORK="$HOME/qqsafe-tool"
SDK="$WORK/android-sdk"
AVD="qqsafe"
PORT=5555

say() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }
err() { printf "\n\033[1;31m!! %s\033[0m\n" "$*"; }

say "1/9 检查环境"
ARCH="$(uname -m)"
echo "CPU 架构: $ARCH"
if [ "$ARCH" != "arm64" ]; then
  err "这台机器不是 Apple Silicon（arm64）。Intel Mac 跑不了 arm64 模拟器，请换 M1/M2/M3/M4 的 Mac。"
  exit 1
fi
mkdir -p "$WORK"
cd "$WORK"

if ! command -v python3 >/dev/null 2>&1; then
  err "缺少 python3。请先安装 Xcode 命令行工具：在终端执行 xcode-select --install，装完再重新运行本脚本。"
  exit 1
fi

say "2/9 下载 Android 命令行工具"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  cd "$SDK/cmdline-tools"
  if [ ! -f cmdline.zip ]; then
    curl -fL --retry 3 -o cmdline.zip "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  fi
  unzip -oq cmdline.zip
  rm -rf latest
  mv cmdline-tools latest 2>/dev/null || true
  cd "$WORK"
fi
SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDM="$SDK/cmdline-tools/latest/bin/avdmanager"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || true)}"
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "未检测到 Java，自动下载 JDK 17（约 180MB，等一会儿）..."
  if [ ! -x "$WORK/jdk17/Contents/Home/bin/java" ]; then
    curl -fL --retry 3 -o "$WORK/jdk17.tar.gz" "https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse"
    mkdir -p "$WORK/jdk17"
    tar -xzf "$WORK/jdk17.tar.gz" -C "$WORK/jdk17" --strip-components=1
  fi
  if [ -x "$WORK/jdk17/Contents/Home/bin/java" ]; then
    export JAVA_HOME="$WORK/jdk17/Contents/Home"
  elif [ -x "$WORK/jdk17/bin/java" ]; then
    export JAVA_HOME="$WORK/jdk17"
  fi
fi
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  err "Java 安装失败。请手动安装： brew install --cask temurin@17  （或从 adoptium.net 下载 JDK17）"
  exit 1
fi
echo "JAVA_HOME=$JAVA_HOME"

say "3/9 安装 SDK 组件（模拟器 + arm64 系统镜像，约 1.5GB，耐心等）"
yes | "$SDKM" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
yes | "$SDKM" --sdk_root="$SDK" "platform-tools" "emulator" "system-images;android-33;google_apis;arm64-v8a"

say "4/9 创建 arm64 模拟器"
if ! "$SDK/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$AVD"; then
  echo no | "$AVDM" --sdk_root="$SDK" create avd -n "$AVD" -k "system-images;android-33;google_apis;arm64-v8a" -d pixel_5 --force
fi

say "5/9 启动模拟器（第一次开机 3-10 分钟）"
ADB="$SDK/platform-tools/adb"
if ! "$ADB" devices | grep -q "^emulator-"; then
  nohup "$SDK/emulator/emulator" -avd "$AVD" -no-snapshot -no-audio -netdelay none -netspeed full >/tmp/qqsafe-emulator.log 2>&1 &
  sleep 5
fi
echo "等待模拟器开机..."
for i in $(seq 1 180); do
  BOOT=$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  if [ "$BOOT" = "1" ]; then echo "模拟器已开机"; break; fi
  sleep 5
  if [ $((i % 12)) -eq 0 ]; then echo "  ...还在开机（${i}0 秒）"; fi
done

say "6/9 获取 root 并安装 QQ安全中心"
"$ADB" root >/dev/null 2>&1 || true
sleep 3
"$ADB" wait-for-device
"$ADB" install -r "$WORK/qqsafe.apk" >/dev/null 2>&1 || true
if ! "$ADB" shell pm list packages 2>/dev/null | grep -q com.tencent.token; then
  echo "下载 QQ安全中心 安装包..."
  curl -fL --retry 3 -o "$WORK/qqsafe.apk" "$BASE/qq-safe-app.apk"
  "$ADB" install -r "$WORK/qqsafe.apk"
fi

say "7/9 部署 frida-server（抓秘钥用）"
if [ ! -f "$WORK/frida-server" ]; then
  curl -fL --retry 3 -o "$WORK/frida-server" "$BASE/frida-server-android-arm64"
  chmod +x "$WORK/frida-server"
fi
"$ADB" push "$WORK/frida-server" /data/local/tmp/frida-server >/dev/null
"$ADB" shell chmod 755 /data/local/tmp/frida-server
"$ADB" shell "pkill -f frida-server 2>/dev/null; nohup /data/local/tmp/frida-server -l 127.0.0.1:27042 >/data/local/tmp/fs.log 2>&1 &" >/dev/null 2>&1 || true
sleep 3
"$ADB" forward tcp:27042 tcp:27042 >/dev/null

say "8/9 安装 frida 客户端（Mac 上）"
python3 -m pip install --user --quiet "frida==16.7.19" 2>/dev/null || python3 -m pip install --user --quiet --break-system-packages "frida==16.7.19"

cat > "$WORK/capture.py" <<'PYEOF'
import frida, sys, time, json, re, subprocess

LOG = '/tmp/qqsafe-capture.log'
SCRIPT = r'''
var out = [];
function emit(o){ send(o); }
Java.perform(function(){
  var Cipher = Java.use('javax.crypto.Cipher');
  var overloads = Cipher.doFinal.overloads;
  for (var i=0;i<overloads.length;i++){
    (function(ov){
      ov.implementation = function(){
        var args = Array.prototype.slice.call(arguments);
        var res = ov.call.apply(ov, [this].concat(args));
        try{
          var inHex = '', outHex = '';
          if (args.length>=1 && args[0]!==null && args[0].length!==undefined){ inHex = bytesToHex(args[0]); }
          if (res && res.length!==undefined){ outHex = bytesToHex(res); }
          emit({type:'cipher', algo:String(this.getAlgorithm()), inHex: inHex, outHex: outHex});
        }catch(e){}
        return res;
      };
    })(overloads[i]);
  }
  function bytesToHex(a){
    var n = Math.min(a.length, 128), s='';
    for(var i=0;i<n;i++){ var v=(a[i]&0xff).toString(16); if(v.length<2) v='0'+v; s+=v; }
    return s;
  }
  emit({type:'ready'});
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
    print('启动 QQ安全中心 ...')
    pid = dev.spawn(['com.tencent.token'])
    session = dev.attach(pid)
    script = session.create_script(SCRIPT)
    script.on('message', on_message)
    script.load()
    dev.resume(pid)
    print('\n=== HOOK 已装好 ===')
    print('现在请在模拟器里登录 QQ（扫码），然后打开「QQ手机令牌」完成绑定。')
    print('下方是抓到的解密数据（出现 PREF_KEY / token 相关就是抓到了）：\n')
    last = 0
    while True:
        try:
            with open(LOG) as f:
                lines = f.readlines()
            for line in lines[last:]:
                last += 1
                if len(line) > 400:
                    print(line[:400] + ' ...')
                else:
                    print(line.rstrip())
        except Exception:
            pass
        time.sleep(1)

if __name__ == '__main__':
    main()
PYEOF

say "9/9 启动抓取（保持这个窗口开着）"
echo "========================================================"
echo "接下来在模拟器窗口里操作："
echo "  1) 打开 QQ安全中心 → 同意协议"
echo "  2) 点「登录QQ」→ 用手机QQ 扫码登录"
echo "  3) 进入「QQ手机令牌」→ 开启/绑定令牌（按提示）"
echo "  4) 绑定成功后出现 6 位动态码"
echo
echo "本窗口会自动打印抓到的解密数据。"
echo "========================================================"
sleep 3
cd "$WORK" && exec python3 capture.py
