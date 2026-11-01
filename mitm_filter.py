import os
import re
import json
from mitmproxy import http

LOG = os.path.join(os.path.expanduser('~'), 'mitm_capture.log')
KEYS = ('secret', 'token', 'qqtoken', 'aes', 'key', 'sig', 'uin', 'bind')

def _write(s):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(s + '\n')
    except Exception:
        pass
    print(s, flush=True)

def response(flow: http.HTTPFlow) -> None:
    try:
        url = flow.request.pretty_url
        host = flow.request.pretty_host
        # 只关心腾讯域名
        if 'qq.com' not in host and 'tencent' not in host:
            return
        txt = ''
        try:
            txt = flow.response.get_text(strict=False) or ''
        except Exception:
            txt = ''
        low = (url + ' ' + txt[:4000]).lower()
        if not any(k in low for k in KEYS):
            return
        _write('=== ' + host + flow.request.path[:120])
        _write('  status=' + str(flow.response.status_code))
        if txt:
            body = txt[:1500].replace('\n', ' ')
            _write('  body=' + body)
    except Exception as e:
        pass

def request(flow: http.HTTPFlow) -> None:
    try:
        host = flow.request.pretty_host
        if 'qq.com' not in host and 'tencent' not in host:
            return
        path = flow.request.path
        low = path.lower()
        if any(k in low for k in ('token', 'bind', 'safe', 'secret')):
            _write('>>> ' + flow.request.method + ' ' + host + path[:200])
    except Exception:
        pass
