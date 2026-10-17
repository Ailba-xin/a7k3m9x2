// Q币余额表 · 独立手机版 —— 中转函数（Vercel Serverless）
//
// 为什么需要它：腾讯的「交易明细」接口不允许浏览器跨域访问（浏览器会直接拦掉），
// 所以手机页面没法直接拿明细/微信支付笔数。这个函数在服务器侧替手机请求，
// 再把结果带 CORS 头返回给手机 —— 效果就和电脑版一样了。
//
// 安全措施：
//   1) 只允许转发到 api.unipay.qq.com（不会变成万能代理）
//   2) 不记录、不存储任何 openid/openkey（纯转发）
//   3) 只允许 GET
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    // 鉴权：必须带上授权码，防止被别人白用
    const need = (process.env.PROXY_TOKEN || '').trim().toUpperCase();
    const got = String((req.query && req.query.t) || '').trim().toUpperCase();
    if (need && got !== need) { res.status(401).json({ error: 'unauthorized' }); return; }
    const raw = req.query && req.query.u;
    if (!raw) { res.status(400).json({ error: 'missing u' }); return; }
    const target = new URL(String(raw));
    // 白名单：只允许腾讯充值/支付域名
    if (target.hostname !== 'api.unipay.qq.com') {
      res.status(403).json({ error: 'host not allowed' });
      return;
    }
    const r = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://my.pay.qq.com/account/index.shtml',
      },
    });
    const text = await r.text();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};