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

// Credentials follow the v3 gateway: sender_key (X-SenderKey, per channel),
// API token (X-JwtToken, per account and environment), Channel Secret (verifies X-Signature on received requests).
TC.HEX = '0123456789abcdef';
TC.b64url = str => btoa(unescape(encodeURIComponent(str))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
TC.newSenderKey = () => TC.rand(40, TC.HEX);
TC.newApiToken = env => `${TC.b64url('{"typ":"JWT","alg":"HS256"}')}.${TC.b64url(JSON.stringify({ useMode: env === 'live' ? 'L' : 'T', companyId: TC.rand(10) }))}.${TC.rand(43, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')}`;
TC.newChannelSecret = () => TC.rand(32, TC.HEX);
TC.newChannelId = () => `ch_${TC.rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
TC.mask = k => k ? k.slice(0, 8) + '••••••••' + k.slice(-4) : '';

TC.hmac = async (secret, msg) => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
};
// X-Signature: HS256 JWT whose claim is { jwtToken: <account API token> }, signed with the Channel Secret.
TC.signature = async (secret, apiToken) => {
  const unsigned = `${TC.b64url('{"typ":"JWT","alg":"HS256"}')}.${TC.b64url(JSON.stringify({ jwtToken: apiToken }))}`;
  const sig = btoa(String.fromCharCode(...await TC.hmac(secret, unsigned))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${unsigned}.${sig}`;
};

// ---------- store ----------
const STORE_KEY = 'talkconnector.v2';

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
    webhook: { url: '', secret: TC.newChannelSecret(), seenInfo: false, enabled: false },
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

// ---------- Icons (24px stroke set) ----------
const ICON_PATHS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  chat: '<path d="M7 4h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-6l-5 4v-4.4A4 4 0 0 1 3 13V8a4 4 0 0 1 4-4z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  inbox: '<path d="M4 13l2-8h12l2 8"/><path d="M4 13v6h16v-6h-5a3 3 0 0 1-6 0z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V4.5M8 7h8"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.6"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8S9 3 7 4.5 9 8 12 8zM12 8s3-5 5-3.5S15 8 12 8z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3a12 12 0 0 1 12-9 12 12 0 0 1-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  rules: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4M5 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/>',
  pointer: '<path d="M9 3v10l-3-2-2 2 6 8h8l2-8-6-2V3z"/>',
  message: '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h6"/>',
  code: '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  glossary: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M9 7h6M9 11h4"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v6H4V5h6"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
};
TC.icon = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;

TC.LOGO = `<img class="logo-l" src="assets/brand/logo-light.svg" alt="톡커넥터 TalkConnector" width="107" height="30"><img class="logo-d" src="assets/brand/logo-dark.svg" alt="" aria-hidden="true" width="107" height="30">`;
TC.SYMBOL = '<img src="assets/brand/symbol.svg" alt="" width="64" height="64">';

TC.header = (links = true) => {
  const s = TC.state();
  const page = location.pathname.split('/').pop() || 'index.html';
  const ctx = { 'console.html': '콘솔', 'admin.html': '운영자', 'docs.html': 'API 문서' }[page];
  const nav = [['index.html#how', '이용 방법'], ['index.html#pricing', '요금제'], ['docs.html', 'API 문서'], ['index.html#faq', 'FAQ']];
  let hidden = false;
  try { hidden = sessionStorage.getItem('tc.noteHidden') === '1'; } catch { }
  return `${hidden ? '' : `<div class="proto-banner" id="protoNote"><span><b>프로토타입</b> 입력한 정보는 이 브라우저에만 저장되며 실제 카카오 채널과 연결되지 않습니다.</span><button type="button" aria-label="안내 닫기">${TC.icon('close', '')}</button></div>`}
  <header class="topnav"><div class="container">
    <button class="btn sm menu-toggle" id="menuToggle" aria-label="메뉴 열기">${TC.icon('menu')}</button>
    <a class="brand" href="index.html" aria-label="톡커넥터 홈">${TC.LOGO}</a>
    ${ctx ? `<span class="ctx">${ctx}</span>` : ''}
    ${links ? `<nav>${nav.map(([h, t]) => `<a href="${h}" class="${h === page ? 'on' : ''}">${t}</a>`).join('')}</nav>` : ''}
    <span class="spacer"></span>
    <div class="actions">
      ${page === 'admin.html' ? `<a class="btn sm" href="index.html">서비스 홈</a>` : s && s.company ? `<a class="btn sm" href="docs.html">API 문서</a><a class="btn sm primary" href="console.html">콘솔</a>` : `<a class="btn sm" href="login.html">로그인</a><a class="btn sm primary" href="login.html">무료로 시작</a>`}
    </div>
  </div></header>`;
};

TC.footer = () => `<footer class="footer"><div class="container">
  <div class="cols">
    <div><a class="brand" href="index.html">${TC.LOGO}</a><p class="small" style="margin:14px 0 0;max-width:340px">카카오 상담톡 API 셀프서비스. 가입부터 연동, 결제까지 콘솔에서 직접 진행합니다. (프로토타입)</p></div>
    <span class="spacer"></span>
    <div class="links"><a href="docs.html">API 문서</a><a href="index.html#pricing">요금제</a><a href="terms.html">이용약관</a><a href="privacy.html"><b>개인정보 처리방침</b></a><a href="admin.html">운영자</a></div>
  </div>
  <div class="wm" aria-hidden="true">TALKCONNECTOR</div>
</div></footer>`;

// Brand favicon for every page
TC.favicon = () => {
  TC.$$('link[rel="icon"]').forEach(l => l.remove());
  document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="assets/brand/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="assets/brand/apple-touch-icon-180.png">');
};

// Sidebar links declare data-i="iconName"; render the icon in front of the label.
TC.decorateSidebar = root => TC.$$('a[data-i]', root).forEach(a => { if (!a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', TC.icon(a.dataset.i)); });

// Copy button on code blocks
TC.copyButtons = root => TC.$$('pre', root).forEach(p => {
  if (p.querySelector('.copy-btn')) return;
  const b = document.createElement('button');
  b.className = 'copy-btn'; b.type = 'button'; b.textContent = '복사';
  b.onclick = () => TC.copy(p.innerText.replace(/\n?복사$/, '').replace(/^복사\n?/, ''));
  p.appendChild(b);
});

TC.mountChrome = () => {
  TC.favicon();
  const h = document.getElementById('header');
  if (h) h.outerHTML = TC.header(h.dataset.links !== 'false');
  const f = document.getElementById('footer');
  if (f) f.outerHTML = TC.footer();
  const note = document.getElementById('protoNote');
  if (note) note.querySelector('button').onclick = () => { note.remove(); try { sessionStorage.setItem('tc.noteHidden', '1'); } catch { } };
  const sb = document.querySelector('.sidebar');
  if (sb) TC.decorateSidebar(sb);
  const t = document.getElementById('menuToggle');
  if (t && sb) t.addEventListener('click', () => sb.classList.toggle('open'));
  else if (t) t.remove();
};
