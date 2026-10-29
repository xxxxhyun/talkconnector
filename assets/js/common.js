// TalkConnector prototype: shared config, state store, helpers.
// All data lives in this browser only (localStorage). No server is called.

const TC = {};

TC.API_BASE = 'https://api.talkconnector.example';
TC.TRIAL_DAYS = 30;

TC.PLANS = [
  { id: 'starter', name: 'Starter', price: 15000, quota: 100, unit: 150 },
  { id: 'basic', name: 'Basic', price: 45000, quota: 300, unit: 150 },
  { id: 'standard', name: 'Standard', price: 75000, quota: 500, unit: 150, featured: true },
  { id: 'pro', name: 'Pro', price: 140000, quota: 1000, unit: 140 },
];
TC.plan = id => TC.PLANS.find(p => p.id === id);

TC.won = n => n.toLocaleString('ko-KR') + '원';
TC.num = n => n.toLocaleString('ko-KR');
TC.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

TC.fmtDate = (t, withTime = true) => {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
};

TC.rand = (len, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, x => alphabet[x % alphabet.length]).join('');
};
TC.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : TC.rand(8) + '-' + TC.rand(4) + '-' + TC.rand(4) + '-' + TC.rand(12));

// Key formats: tc_test_ / tc_live_ (API key), whsec_ (webhook signing secret), ch_ (channel id)
TC.newApiKey = env => `tc_${env}_${TC.rand(32)}`;
TC.newSecret = () => `whsec_${TC.rand(32)}`;
TC.newChannelId = () => `ch_${TC.rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
TC.mask = k => {
  if (!k) return '';
  const prefix = k.slice(0, k.lastIndexOf('_') + 1);
  return prefix + '••••••••' + k.slice(-4);
};

TC.hmacHex = async (secret, msg) => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
};

// ---------- store ----------
const STORE_KEY = 'talkconnector.v1';

TC.load = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
};
TC.save = s => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ }
  TC._mem = s;
};
TC.state = () => TC.load() || TC._mem || null;
TC.reset = () => {
  try { localStorage.removeItem(STORE_KEY); } catch { }
  TC._mem = null;
};
TC.update = fn => {
  const s = TC.state();
  fn(s);
  TC.save(s);
  return s;
};
TC.audit = (s, action, detail = '') => {
  s.audit.unshift({ at: Date.now(), actor: s.user.email, action, detail });
  s.audit = s.audit.slice(0, 200);
};

TC.createAccount = ({ provider, name, email }) => {
  const now = Date.now();
  const s = {
    createdAt: now,
    user: { provider, name, email },
    company: null,
    consents: null,
    channels: [],
    keys: [],
    webhook: { url: '', secret: TC.newSecret(), events: ['message', 'session.started', 'session.ended', 'message.read', 'personal_info'], enabled: false },
    deliveries: [],
    billing: { plan: null, card: null, autoRenew: true, history: [] },
    alerts: { at80: true, atZero: true, email: email },
    audit: [],
  };
  TC.audit(s, '가입', `${provider} 로그인, 계정 생성`);
  TC.save(s);
  return s;
};

// Demo usage: counts per day for the current billing cycle, cut at 04:00 KST.
TC.usageFor = (s, ch) => {
  if (!ch.usage) return [];
  return ch.usage;
};
TC.seedUsage = (days, scale) => {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(4, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const base = dow === 0 || dow === 6 ? scale * 0.4 : scale;
    out.push({ date: TC.fmtDate(d, false), rooms: Math.max(0, Math.round(base * (0.6 + Math.random() * 0.8))) });
  }
  return out;
};

// ---------- UI helpers ----------
TC.$ = (sel, root = document) => root.querySelector(sel);
TC.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

TC.toast = msg => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
};

TC.copy = async text => {
  try { await navigator.clipboard.writeText(text); TC.toast('복사했습니다'); }
  catch { TC.toast('복사에 실패했습니다. 직접 선택해 복사해 주세요'); }
};

TC.modal = (html, onMount) => {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  onMount && onMount(bg.firstElementChild, close);
  return close;
};

TC.confirm = (title, body, okLabel = '확인', danger = false) => new Promise(resolve => {
  TC.modal(`<h3>${title}</h3><p class="muted">${body}</p>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn" data-close>취소</button>
      <button class="btn primary ${danger ? 'danger' : ''}" data-ok>${okLabel}</button>
    </div>`, (m, close) => {
    m.querySelector('[data-close]').addEventListener('click', () => resolve(false));
    m.querySelector('[data-ok]').addEventListener('click', () => { close(); resolve(true); });
  });
});

TC.BRAND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary-ink)"><path d="M4 12h5M15 12h5"/><circle cx="12" cy="12" r="3"/></svg>';

TC.header = (links = true) => {
  const s = TC.state();
  return `<div class="proto-banner">프로토타입 화면입니다. 입력한 정보는 이 브라우저에만 저장되며 실제 카카오 채널과 연결되지 않습니다.</div>
  <header class="topnav"><div class="container">
    <button class="btn sm menu-toggle" id="menuToggle" aria-label="메뉴">메뉴</button>
    <a class="brand" href="index.html"><span class="brand-mark">${TC.BRAND_SVG}</span>TalkConnector</a>
    ${links ? `<nav>
      <a href="index.html#how">이용 방법</a>
      <a href="index.html#pricing">요금제</a>
      <a href="docs.html">API 문서</a>
      <a href="index.html#faq">FAQ</a>
    </nav>` : ''}
    <span class="spacer"></span>
    ${s ? `<a class="btn sm" href="console.html">콘솔</a>` : `<a class="btn sm" href="login.html">로그인</a><a class="btn sm primary" href="login.html">무료로 시작</a>`}
  </div></header>`;
};

TC.footer = () => `<footer class="footer"><div class="container row">
  <span>TalkConnector 카카오 상담톡 API 셀프서비스 (프로토타입)</span>
  <span class="spacer"></span>
  <a href="terms.html">이용약관</a><a href="privacy.html">개인정보 처리방침</a><a href="docs.html">API 문서</a><a href="admin.html">운영자</a>
</div></footer>`;

TC.mountChrome = () => {
  const h = document.getElementById('header');
  if (h) h.outerHTML = TC.header(h.dataset.links !== 'false');
  const f = document.getElementById('footer');
  if (f) f.outerHTML = TC.footer();
  const t = document.getElementById('menuToggle');
  const sb = document.querySelector('.sidebar');
  if (t && sb) t.addEventListener('click', () => sb.classList.toggle('open'));
  else if (t) t.remove();
};
