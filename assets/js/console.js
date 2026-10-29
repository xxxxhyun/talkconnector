// TalkConnector console prototype (hash router, state in localStorage)

TC.mountChrome();

const page = document.getElementById('page');
const S = () => TC.state();

if (!S() || !S().company) location.replace('login.html');

const CATEGORIES = ['쇼핑·커머스', '금융·보험', '교육', '여행·숙박', '의료·건강', '공공·기관', 'IT·서비스', '기타'];
const EVENTS = [
  { id: 'message', label: '고객 메시지', src: '/message' },
  { id: 'session.started', label: '상담 연결 (메타 정보)', src: '/reference' },
  { id: 'session.ended', label: '상담 세션 종료', src: '/expired_session' },
  { id: 'message.read', label: '고객 읽음', src: '/seen_info' },
  { id: 'personal_info', label: '개인정보 제공 동의 결과', src: '/personal_info' },
  { id: 'cert_result', label: '카카오톡 인증 결과', src: '/cert_result' },
];
const SCOPES = {
  read: { label: '조회', desc: '세션·채널·사용량 조회' },
  write: { label: '발송', desc: '조회 + 메시지 발송·삭제, 상담 종료, 읽음·차단, 업로드' },
  admin: { label: '관리', desc: '발송 + 채널 설정(상담시간, 시스템 메시지)' },
};
const RATE = { test: '초당 10건', live: '초당 50건' };

const head = (title, desc = '', actions = '') => `
  <div class="page-head"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div><span class="spacer"></span>${actions}</div>`;

const activeChannels = s => s.channels.filter(c => c.status === 'active');
const liveChannels = s => activeChannels(s).filter(c => c.env === 'live');
const trialLeft = s => Math.max(0, Math.ceil((s.trial.endsAt - Date.now()) / 864e5));

function cycleUsage(s) {
  return liveChannels(s).reduce((sum, c) => sum + (c.usage || []).reduce((a, d) => a + d.rooms, 0), 0);
}

function quotaState(s) {
  const plan = s.billing.plan && TC.plan(s.billing.plan);
  if (!plan) return null;
  const used = cycleUsage(s);
  const pct = Math.min(100, Math.round(used / plan.quota * 100));
  return { plan, used, pct, level: pct >= 100 ? 'err' : pct >= 80 ? 'warn' : '' };
}

// ---------- Dashboard ----------
function viewDashboard() {
  const s = S();
  const hasChannel = activeChannels(s).length > 0;
  const hasKey = s.keys.some(k => !k.revokedAt);
  const hasUrl = !!s.webhook.url;
  const testOk = s.deliveries.some(d => d.ok);
  const hasPlan = !!s.billing.plan;
  const checklist = [
    { done: true, label: '가입·약관 동의', href: '#/settings' },
    { done: hasChannel, label: '채널 연결', href: '#/channels/new' },
    { done: hasKey, label: 'API 키 발급', href: '#/keys' },
    { done: hasUrl, label: '웹훅 URL 등록', href: '#/webhook' },
    { done: testOk, label: '테스트 웹훅 수신 확인', href: '#/webhook' },
    { done: hasPlan, label: '요금제 선택 (운영 전환 시)', href: '#/billing' },
  ];
  const doneCount = checklist.filter(c => c.done).length;
  const q = quotaState(s);
  const left = trialLeft(s);

  page.innerHTML = head(`${TC.esc(s.company.name)}`, `${TC.esc(s.user.name)}님, 안녕하세요`) + `
    ${q ? '' : left > 0 ? `<div class="notice">무료 테스트 기간 <b>${left}일</b> 남음 (${TC.fmtDate(s.trial.endsAt, false)} 종료). 종료 후에는 요금제를 선택하거나 영업 담당자와 연장을 협의해 주세요.</div>`
      : `<div class="notice warn">무료 테스트 기간이 끝났습니다. 테스트 채널 발송이 중단되었습니다. <a href="#/billing">요금제 선택</a></div>`}
    ${q && q.level ? `<div class="notice ${q.level}">이번 달 사용량이 ${q.pct}%에 도달했습니다. ${q.level === 'err' ? '운영 채널 발송이 중단되었습니다.' : ''} <a href="#/billing">요금제 변경</a></div>` : ''}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><div class="label">연결된 채널</div><div class="value">${activeChannels(s).length}</div><div class="small muted">테스트 ${activeChannels(s).filter(c => c.env === 'test').length} · 운영 ${liveChannels(s).length}</div></div>
      <div class="card stat"><div class="label">활성 API 키</div><div class="value">${s.keys.filter(k => !k.revokedAt).length}</div></div>
      <div class="card stat"><div class="label">이번 달 상담방</div><div class="value">${TC.num(cycleUsage(s))}</div>
        ${q ? `<div class="meter ${q.level}"><div style="width:${q.pct}%"></div></div><div class="small muted">${q.plan.name} ${TC.num(q.plan.quota)}건 중 ${q.pct}%</div>` : '<div class="small muted">운영 채널 기준</div>'}</div>
      <div class="card stat"><div class="label">요금제</div><div class="value" style="font-size:20px">${q ? q.plan.name : 'Free 테스트'}</div><div class="small muted">${q ? TC.won(q.plan.price) + ' / 월' : '카드 등록 없음'}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="row"><h3 style="margin:0">연동 체크리스트</h3><span class="spacer"></span><span class="badge ${doneCount === checklist.length ? 'ok' : 'primary'}">${doneCount}/${checklist.length}</span></div>
        <div class="meter" style="margin:12px 0"><div style="width:${doneCount / checklist.length * 100}%"></div></div>
        ${checklist.map(c => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)">
          <span class="badge ${c.done ? 'ok' : ''}" style="width:22px;justify-content:center;padding:0">${c.done ? '✓' : ''}</span>
          <span style="${c.done ? 'color:var(--ink-3)' : ''}">${c.label}</span><span class="spacer"></span>
          ${c.done ? '' : `<a class="btn sm" href="${c.href}">진행</a>`}</div>`).join('')}
      </div>
      <div class="card">
        <h3>최근 웹훅 전송</h3>
        ${s.deliveries.length ? `<div class="table-wrap" style="box-shadow:none"><table>
          ${s.deliveries.slice(0, 6).map(d => `<tr><td class="mono small">${d.event}</td><td>${statusBadge(d)}</td><td class="muted small">${TC.fmtDate(d.at)}</td></tr>`).join('')}
        </table></div>` : `<p class="muted">아직 전송 이력이 없습니다.</p><a class="btn sm" href="#/webhook">테스트 이벤트 보내기</a>`}
      </div>
    </div>`;
}

const statusBadge = d => d.ok ? `<span class="badge ok">${d.code || '성공'}</span>` : d.pending ? '<span class="badge">전송 중</span>' : `<span class="badge err">${d.code || '실패'}</span>`;

// ---------- Channels ----------
function viewChannels() {
  const s = S();
  page.innerHTML = head('채널', '카카오톡 채널을 발신프로필로 등록하고 상담톡을 활성화합니다', '<a class="btn primary" href="#/channels/new">채널 연결</a>') +
    (s.channels.length ? `<div class="table-wrap"><table>
      <tr><th>채널</th><th>채널 ID</th><th>환경</th><th>상태</th><th>연결일</th><th></th></tr>
      ${s.channels.map(c => `<tr>
        <td><b>${TC.esc(c.name)}</b><div class="muted small">${TC.esc(c.searchId)}</div></td>
        <td class="mono small">${c.id}</td>
        <td>${envBadge(c.env)}</td>
        <td>${c.status === 'active' ? '<span class="badge ok">상담톡 이용중</span>' : '<span class="badge">이용 중지</span>'}</td>
        <td class="small muted">${TC.fmtDate(c.createdAt, false)}</td>
        <td><a class="btn sm" href="#/channels/${c.id}">관리</a></td></tr>`).join('')}
    </table></div>` : `<div class="card" style="text-align:center;padding:48px 20px">
      <h3>연결된 채널이 없습니다</h3><p class="muted">테스트 채널은 무료 기간 동안 과금 없이 사용할 수 있습니다.</p>
      <a class="btn primary" href="#/channels/new">첫 채널 연결하기</a></div>`);
}

const envBadge = env => env === 'live' ? '<span class="badge primary">운영</span>' : '<span class="badge warn">테스트</span>';

function viewChannelNew() {
  const s = S();
  const canLive = !!(s.billing.plan && s.billing.card);
  const w = { step: 1, env: 'test', searchId: '', phone: s.company.phone, category: CATEGORIES[0], code: '' };

  const render = () => {
    const steps = ['채널 정보', '관리자 인증', '상담톡 활성화', '연동 정보'];
    page.innerHTML = head('채널 연결', '카카오톡 채널 관리자 휴대폰 인증으로 3분 안에 연결합니다') + `
      <div class="wizard-steps">${steps.map((t, i) => `<div class="ws ${i + 1 === w.step ? 'on' : i + 1 < w.step ? 'done' : ''}"><b>STEP ${i + 1}</b>${t}</div>`).join('')}</div>
      <div class="card" id="wz"></div>`;
    const wz = TC.$('#wz');
    if (w.step === 1) {
      wz.innerHTML = `
        <label class="field"><span>환경</span>
          <select id="env">
            <option value="test">테스트 채널 (과금 없음, 무료 기간 동안)</option>
            <option value="live" ${canLive ? '' : 'disabled'}>운영 채널 ${canLive ? '' : '(요금제·카드 등록 후 가능)'}</option>
          </select></label>
        <label class="field"><span>카카오톡 채널 검색용 아이디</span><input type="text" id="searchId" placeholder="@mybrand" value="${TC.esc(w.searchId)}"></label>
        <label class="field"><span>채널 관리자 휴대폰 번호</span><input type="tel" id="phone" value="${TC.esc(w.phone)}"><div class="small muted" style="margin-top:4px">카카오톡 채널 관리자센터에 등록된 관리자 번호로 인증번호가 발송됩니다.</div></label>
        <label class="field"><span>채널 카테고리</span><select id="cat">${CATEGORIES.map(c => `<option ${c === w.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <div class="row"><span class="spacer"></span><button class="btn primary" id="go">인증번호 요청</button></div>`;
      TC.$('#go').onclick = () => {
        w.env = TC.$('#env').value;
        w.searchId = TC.$('#searchId').value.trim();
        w.phone = TC.$('#phone').value.trim();
        w.category = TC.$('#cat').value;
        if (!/^@?[\w가-힣.-]{2,}$/.test(w.searchId)) return TC.toast('검색용 아이디를 확인해 주세요');
        if (!w.searchId.startsWith('@')) w.searchId = '@' + w.searchId;
        if (w.phone.replace(/\D/g, '').length < 10) return TC.toast('휴대폰 번호를 확인해 주세요');
        w.code = TC.rand(6, '0123456789');
        w.step = 2; render();
      };
    } else if (w.step === 2) {
      wz.innerHTML = `
        <div class="notice">${TC.esc(w.phone)} 카카오톡으로 인증번호를 보냈습니다. 유효시간 10분<br><span class="small muted">프로토타입 인증번호: <b class="mono">${w.code}</b></span></div>
        <label class="field"><span>인증번호 6자리</span><input type="text" id="code" inputmode="numeric" maxlength="6" placeholder="000000"></label>
        <div class="row"><button class="btn" id="back">이전</button><span class="spacer"></span><button class="btn primary" id="go">인증</button></div>`;
      TC.$('#back').onclick = () => { w.step = 1; render(); };
      TC.$('#go').onclick = () => {
        if (TC.$('#code').value.trim() !== w.code) return TC.toast('인증번호가 일치하지 않습니다');
        w.step = 3; render();
      };
    } else if (w.step === 3) {
      wz.innerHTML = `
        <dl class="kv" style="margin-bottom:16px">
          <dt>채널</dt><dd>${TC.esc(w.searchId)}</dd>
          <dt>환경</dt><dd>${envBadge(w.env)}</dd>
          <dt>카테고리</dt><dd>${TC.esc(w.category)}</dd>
        </dl>
        <div class="notice warn">상담톡을 활성화하면 다음이 적용됩니다.
          <ul style="margin:6px 0 0;padding-left:18px">
            <li>카카오비즈니스 파트너센터의 1:1 채팅 메뉴를 사용할 수 없고 모든 상담은 API로 처리됩니다.</li>
            <li>상담 메시지는 카카오에 3일만 보관되므로 웹훅으로 받은 내용을 직접 저장해야 합니다.</li>
            <li>웹훅 수신 준비 전 활성화하면 고객 메시지가 유실될 수 있습니다.</li>
          </ul></div>
        <label class="check"><input type="checkbox" id="agree"><span>위 내용을 확인했으며 상담톡 이용을 시작합니다.</span></label>
        <div class="row"><button class="btn" id="back">이전</button><span class="spacer"></span><button class="btn primary" id="go" disabled>상담톡 활성화</button></div>`;
      TC.$('#agree').onchange = e => { TC.$('#go').disabled = !e.target.checked; };
      TC.$('#back').onclick = () => { w.step = 1; render(); };
      TC.$('#go').onclick = () => {
        let issuedKey = null;
        TC.update(st => {
          const ch = {
            id: TC.newChannelId(), name: w.searchId.slice(1), searchId: w.searchId, env: w.env, category: w.category,
            status: 'active', createdAt: Date.now(),
            consultHours: { weekdays: '09:00-18:00', weekend: false, holiday: false },
            usage: w.env === 'live' ? TC.seedUsage(new Date().getDate(), 6) : TC.seedUsage(new Date().getDate(), 1),
          };
          st.channels.push(ch);
          TC.audit(st, '채널 연결', `${ch.searchId} (${ch.env}) ${ch.id}`);
          if (!st.keys.some(k => k.env === w.env && !k.revokedAt)) {
            issuedKey = issueKey(st, w.env, `${w.env === 'live' ? '운영' : '테스트'} 기본 키`, 'write');
          }
          w.channelId = ch.id;
        });
        w.issuedKey = issuedKey;
        w.step = 4; render();
      };
    } else {
      const st = S();
      wz.innerHTML = `
        <div class="notice ok">${TC.esc(w.searchId)} 채널이 연결되었습니다.</div>
        <label class="field"><span>채널 ID</span>${secretBox(w.channelId)}</label>
        ${w.issuedKey ? `<label class="field"><span>API 키 (지금만 전체 표시됩니다)</span>${secretBox(w.issuedKey)}</label>
          <div class="notice warn small">이 키는 다시 볼 수 없습니다. 안전한 곳에 저장해 주세요. 분실 시 재발급하면 기존 키는 즉시 폐기됩니다.</div>`
          : `<p class="muted small">기존 ${w.env === 'live' ? '운영' : '테스트'} API 키를 그대로 사용합니다. <a href="#/keys">API 키 관리</a></p>`}
        <label class="field"><span>웹훅 서명 키</span>${secretBox(TC.mask(st.webhook.secret))}</label>
        <h3 style="margin-top:20px">다음 단계</h3>
        <pre>curl -X POST ${TC.API_BASE}/v1/messages \\
  -H "Authorization: Bearer ${w.issuedKey || (st.keys.find(k => k.env === w.env && !k.revokedAt)?.masked || '')}" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":"${w.channelId}","userKey":"{userKey}","type":"text","text":"안녕하세요"}'</pre>
        <div class="row"><a class="btn" href="#/channels/${w.channelId}">채널 관리</a><span class="spacer"></span><a class="btn primary" href="#/webhook">웹훅 설정하고 테스트하기</a></div>`;
      bindCopy(wz);
    }
  };
  render();
}

const secretBox = v => `<div class="secret"><code>${TC.esc(v)}</code><button class="btn sm" data-copy="${TC.esc(v)}">복사</button></div>`;
const bindCopy = root => TC.$$('[data-copy]', root).forEach(b => b.onclick = () => TC.copy(b.dataset.copy));

function viewChannelDetail(id) {
  const s = S();
  const c = s.channels.find(x => x.id === id);
  if (!c) { page.innerHTML = head('채널을 찾을 수 없습니다') + '<a href="#/channels">목록으로</a>'; return; }
  const ch = c.consultHours;
  const rooms = (c.usage || []).reduce((a, d) => a + d.rooms, 0);
  page.innerHTML = head(TC.esc(c.name), `${TC.esc(c.searchId)} · ${c.id}`, `<a class="btn" href="#/channels">목록</a>`) + `
    <div class="grid grid-2">
      <div class="card">
        <h3>채널 정보</h3>
        <dl class="kv">
          <dt>채널 ID</dt><dd class="mono small">${c.id} <button class="btn sm" data-copy="${c.id}">복사</button></dd>
          <dt>환경</dt><dd>${envBadge(c.env)}</dd>
          <dt>상태</dt><dd>${c.status === 'active' ? '<span class="badge ok">상담톡 이용중</span>' : '<span class="badge">이용 중지</span>'}</dd>
          <dt>카테고리</dt><dd>${TC.esc(c.category)}</dd>
          <dt>연결일</dt><dd>${TC.fmtDate(c.createdAt)}</dd>
          <dt>호출 한도</dt><dd>${RATE[c.env]}</dd>
          <dt>이번 달 상담방</dt><dd>${TC.num(rooms)}건 ${c.env === 'test' ? '<span class="muted small">(과금 없음)</span>' : ''}</dd>
        </dl>
      </div>
      <div class="card">
        <h3>상담시간</h3>
        <p class="muted small">상담시간 외 메시지에는 카카오 시스템 메시지(상담 부재)가 자동 발송됩니다. 시스템 메시지는 과금되지 않습니다.</p>
        <label class="field"><span>평일</span><input type="text" id="wk" value="${TC.esc(ch.weekdays)}" placeholder="09:00-18:00"></label>
        <label class="check"><input type="checkbox" id="we" ${ch.weekend ? 'checked' : ''}><span>주말 상담</span></label>
        <label class="check"><input type="checkbox" id="ho" ${ch.holiday ? 'checked' : ''}><span>공휴일 상담</span></label>
        <button class="btn sm" id="saveHours">저장</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>상담 연결 링크</h3>
      <p class="muted small">웹·앱 버튼에 연결하면 고객이 바로 상담을 시작합니다. <code>extra</code> 값은 상담 연결 웹훅(session.started)으로 전달됩니다.</p>
      ${secretBox(`https://bizmessage.kakao.com/chat/open/${c.searchId}?extra=order_1234`)}
    </div>
    <div class="card" style="margin-top:16px">
      <h3>채널 관리</h3>
      <div class="row">
        ${c.env === 'test' ? `<button class="btn" id="promote">운영 채널로 전환</button>` : ''}
        ${c.status === 'active' ? `<button class="btn danger" id="deact">상담톡 이용 중지</button>` : `<button class="btn" id="react">상담톡 다시 활성화</button>`}
      </div>
      <p class="muted small" style="margin:10px 0 0">이용 중지 시 카카오 채널의 1:1 채팅 기능이 다시 활성화되고 API 발송이 차단됩니다.</p>
    </div>`;
  bindCopy(page);
  TC.$('#saveHours').onclick = () => {
    TC.update(st => {
      const x = st.channels.find(y => y.id === id);
      x.consultHours = { weekdays: TC.$('#wk').value.trim(), weekend: TC.$('#we').checked, holiday: TC.$('#ho').checked };
      TC.audit(st, '상담시간 변경', `${x.id} ${x.consultHours.weekdays}`);
    });
    TC.toast('상담시간을 저장했습니다');
  };
  const promote = TC.$('#promote');
  if (promote) promote.onclick = async () => {
    const st = S();
    if (!st.billing.plan || !st.billing.card) {
      if (await TC.confirm('요금제가 필요합니다', '운영 채널은 요금제 선택과 카드 등록 후 사용할 수 있습니다.', '요금제 선택')) location.hash = '#/billing';
      return;
    }
    if (!await TC.confirm('운영 채널로 전환', '운영 허브파트너로 발신프로필을 다시 등록합니다. 전환 후 상담방이 과금되며 tc_live_ 키로 호출해야 합니다.', '전환')) return;
    TC.update(st2 => {
      const x = st2.channels.find(y => y.id === id);
      x.env = 'live';
      x.usage = TC.seedUsage(new Date().getDate(), 6);
      if (!st2.keys.some(k => k.env === 'live' && !k.revokedAt)) issueKey(st2, 'live', '운영 기본 키', 'write');
      TC.audit(st2, '운영 채널 전환', x.id);
    });
    TC.toast('운영 채널로 전환했습니다. API 키 메뉴에서 운영 키를 확인하세요');
    route();
  };
  const deact = TC.$('#deact');
  if (deact) deact.onclick = async () => {
    if (!await TC.confirm('상담톡 이용 중지', '진행 중인 상담은 종료되고 더 이상 API로 메시지를 보낼 수 없습니다.', '이용 중지', true)) return;
    TC.update(st => { const x = st.channels.find(y => y.id === id); x.status = 'inactive'; TC.audit(st, '상담톡 이용 중지', x.id); });
    route();
  };
  const react = TC.$('#react');
  if (react) react.onclick = () => {
    TC.update(st => { const x = st.channels.find(y => y.id === id); x.status = 'active'; TC.audit(st, '상담톡 활성화', x.id); });
    route();
  };
}

// ---------- API keys ----------
function issueKey(st, env, name, scope) {
  const value = TC.newApiKey(env);
  st.keys.unshift({ id: 'key_' + TC.rand(8), env, name, scope, masked: TC.mask(value), createdAt: Date.now(), lastUsedAt: null, revokedAt: null });
  TC.audit(st, 'API 키 발급', `${name} ${TC.mask(value)}`);
  return value;
}

function viewKeys() {
  const s = S();
  page.innerHTML = head('API 키', '키는 발급 직후 한 번만 전체 표시됩니다. 재발급하면 기존 키는 즉시 폐기됩니다', '<button class="btn primary" id="newKey">새 키 발급</button>') + `
    <div class="table-wrap"><table>
      <tr><th>이름</th><th>키</th><th>환경</th><th>권한</th><th>발급일</th><th>상태</th><th></th></tr>
      ${s.keys.length ? s.keys.map(k => `<tr>
        <td>${TC.esc(k.name)}</td>
        <td class="mono small">${k.masked}</td>
        <td>${envBadge(k.env)}</td>
        <td><span class="badge" title="${SCOPES[k.scope].desc}">${SCOPES[k.scope].label}</span></td>
        <td class="small muted">${TC.fmtDate(k.createdAt)}</td>
        <td>${k.revokedAt ? `<span class="badge">폐기 ${TC.fmtDate(k.revokedAt, false)}</span>` : '<span class="badge ok">사용중</span>'}</td>
        <td>${k.revokedAt ? '' : `<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm" data-rotate="${k.id}">재발급</button><button class="btn sm danger" data-revoke="${k.id}">폐기</button></div>`}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">발급된 키가 없습니다. 채널을 연결하면 기본 키가 자동 발급됩니다.</td></tr>'}
    </table></div>
    <div class="grid grid-3" style="margin-top:16px">
      ${Object.entries(SCOPES).map(([, v]) => `<div class="card"><h3>${v.label} 권한</h3><p class="muted small" style="margin:0">${v.desc}</p></div>`).join('')}
    </div>
    <p class="muted small" style="margin-top:16px">호출 한도: 테스트 키 ${RATE.test}, 운영 키 ${RATE.live}. 초과 시 <code>429 RATE_LIMITED</code>를 반환합니다. 키는 서버에 해시로만 저장됩니다.</p>`;

  TC.$('#newKey').onclick = () => TC.modal(`
    <h3>새 API 키 발급</h3>
    <label class="field"><span>이름</span><input type="text" id="kName" value="새 키"></label>
    <label class="field"><span>환경</span><select id="kEnv"><option value="test">테스트 (tc_test_)</option><option value="live" ${liveChannels(S()).length ? '' : 'disabled'}>운영 (tc_live_) ${liveChannels(S()).length ? '' : '- 운영 채널 필요'}</option></select></label>
    <label class="field"><span>권한</span><select id="kScope">${Object.entries(SCOPES).map(([k, v]) => `<option value="${k}" ${k === 'write' ? 'selected' : ''}>${v.label}: ${v.desc}</option>`).join('')}</select></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="kGo">발급</button></div>`,
    (m, close) => {
      TC.$('#kGo', m).onclick = () => {
        let v;
        TC.update(st => { v = issueKey(st, TC.$('#kEnv', m).value, TC.$('#kName', m).value.trim() || '새 키', TC.$('#kScope', m).value); });
        close(); showOnce(v); viewKeys();
      };
    });

  TC.$$('[data-rotate]').forEach(b => b.onclick = async () => {
    if (!await TC.confirm('키 재발급', '새 키를 발급하고 기존 키는 즉시 폐기합니다. 기존 키를 쓰는 서버는 바로 401 오류가 납니다.', '재발급', true)) return;
    let v;
    TC.update(st => {
      const old = st.keys.find(k => k.id === b.dataset.rotate);
      old.revokedAt = Date.now();
      TC.audit(st, 'API 키 폐기', `${old.name} ${old.masked} (재발급)`);
      v = issueKey(st, old.env, old.name, old.scope);
    });
    showOnce(v); viewKeys();
  });
  TC.$$('[data-revoke]').forEach(b => b.onclick = async () => {
    if (!await TC.confirm('키 폐기', '폐기한 키는 복구할 수 없습니다.', '폐기', true)) return;
    TC.update(st => { const k = st.keys.find(x => x.id === b.dataset.revoke); k.revokedAt = Date.now(); TC.audit(st, 'API 키 폐기', `${k.name} ${k.masked}`); });
    viewKeys();
  });
}

function showOnce(value) {
  TC.modal(`<h3>API 키가 발급되었습니다</h3>
    <p class="muted small">이 창을 닫으면 다시 볼 수 없습니다.</p>
    ${secretBox(value)}
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" data-close>저장했습니다</button></div>`, m => bindCopy(m));
}

// ---------- Webhook ----------
function samplePayload(s, type) {
  const ch = activeChannels(s)[0];
  const base = {
    id: 'evt_' + TC.rand(20), type, createdAt: new Date().toISOString(), livemode: ch ? ch.env === 'live' : false, test: true,
    channelId: ch ? ch.id : 'ch_test000000', userKey: 'tc-test-' + TC.rand(6), sessionId: String(29000 + Math.floor(Math.random() * 999)),
  };
  const data = {
    'message': { serial: String(Date.now()) + TC.rand(5, '0123456789'), time: Date.now(), kind: 'text', text: '배송 언제 오나요?', attachments: [], extra: null },
    'session.started': { extra: 'order_1234', appUserId: null, lastReference: null },
    'session.ended': { endedAt: new Date().toISOString() },
    'message.read': { readAt: new Date().toISOString() },
    'personal_info': { phone: '010-0000-0000', nickname: '테스트고객', consentedAt: new Date().toISOString() },
    'cert_result': { certTxId: 'ctx_' + TC.rand(10), encrypted: TC.rand(48), certifiedAt: new Date().toISOString() },
  }[type];
  return { ...base, data };
}

async function deliver(payload) {
  const s = S();
  const raw = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${await TC.hmacHex(s.webhook.secret, `${t}.${raw}`)}`;
  const headers = { 'Content-Type': 'application/json', 'X-TC-Event': payload.type, 'X-TC-Delivery': payload.id, 'X-TC-Signature': sig };
  const rec = { id: payload.id, event: payload.type, url: s.webhook.url, at: Date.now(), pending: true, headers, body: raw };
  TC.update(st => { st.deliveries.unshift(rec); st.deliveries = st.deliveries.slice(0, 50); });
  const started = performance.now();
  let result;
  try {
    const res = await fetch(s.webhook.url, { method: 'POST', headers, body: raw });
    result = { ok: res.ok, code: String(res.status), note: res.ok ? '' : '2xx가 아니면 재시도 대상입니다' };
  } catch {
    // CORS blocked: retry as a simple request so the endpoint still receives the body.
    try {
      await fetch(s.webhook.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: raw });
      result = { ok: true, code: '전송됨', note: '브라우저 CORS 제한으로 서명 헤더 없이 본문만 전달했고 응답 코드는 확인할 수 없습니다. 실제 서비스는 서버에서 헤더와 함께 전송합니다.' };
    } catch {
      result = { ok: false, code: '연결 실패', note: 'URL에 연결할 수 없습니다. 주소와 HTTPS 인증서를 확인해 주세요.' };
    }
  }
  result.ms = Math.round(performance.now() - started);
  TC.update(st => { const d = st.deliveries.find(x => x.id === rec.id); Object.assign(d, result, { pending: false }); TC.audit(st, '테스트 웹훅 전송', `${payload.type} ${result.code}`); });
  return result;
}

function viewWebhook() {
  const s = S();
  const wh = s.webhook;
  page.innerHTML = head('웹훅', '고객 메시지와 상담 이벤트를 고객사 서버로 전달합니다') + `
    <div class="card">
      <h3>수신 URL</h3>
      <label class="field"><span>엔드포인트 (HTTPS)</span><input type="url" id="url" placeholder="https://your-server.com/talkconnector/webhook" value="${TC.esc(wh.url)}"></label>
      <p class="muted small">테스트용 수신 주소가 없다면 webhook.site 같은 요청 확인 도구의 주소를 넣어 보세요.</p>
      <div class="small" style="font-weight:600;color:var(--ink-2);margin-bottom:6px">수신 이벤트</div>
      <div class="grid grid-2" style="gap:0 16px">
        ${EVENTS.map(e => `<label class="check" style="padding:4px 0"><input type="checkbox" class="ev" value="${e.id}" ${wh.events.includes(e.id) ? 'checked' : ''}><span><code>${e.id}</code> ${e.label}</span></label>`).join('')}
      </div>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="save">저장</button></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>서명 키</h3>
      <p class="muted small">모든 요청의 <code>X-TC-Signature</code> 헤더를 이 키로 검증하세요. 고객사마다 다른 키가 발급됩니다. <a href="docs.html#webhook-signature">검증 방법</a></p>
      <div class="secret"><code id="sec">${TC.mask(wh.secret)}</code><button class="btn sm" id="reveal">보기</button><button class="btn sm" data-copy="${wh.secret}">복사</button><button class="btn sm danger" id="rotate">재발급</button></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>테스트 이벤트 보내기</h3>
      <p class="muted small">실제와 같은 형식과 서명으로 전송합니다. 테스트 이벤트에는 <code>"test": true</code>가 붙고 <code>userKey</code>는 <code>tc-test-</code>로 시작합니다.</p>
      <div class="row">
        <select id="evType" style="max-width:280px">${EVENTS.map(e => `<option value="${e.id}">${e.id}</option>`).join('')}</select>
        <button class="btn primary" id="send" ${wh.url ? '' : 'disabled'}>전송</button>
        ${wh.url ? '' : '<span class="muted small">URL을 먼저 저장하세요</span>'}
      </div>
      <div id="result" style="margin-top:12px"></div>
    </div>
    <h3 style="margin-top:28px">전송 이력</h3>
    <div class="table-wrap"><table>
      <tr><th>이벤트</th><th>결과</th><th>응답 시간</th><th>시각</th><th></th></tr>
      ${s.deliveries.length ? s.deliveries.map(d => `<tr>
        <td class="mono small">${d.event}</td><td>${statusBadge(d)}</td><td class="small">${d.ms != null ? d.ms + 'ms' : ''}</td>
        <td class="small muted">${TC.fmtDate(d.at)}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm" data-view="${d.id}">보기</button><button class="btn sm" data-redo="${d.id}">재전송</button></div></td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">아직 전송 이력이 없습니다.</td></tr>'}
    </table></div>
    <p class="muted small" style="margin-top:12px">재시도 정책: 5초 안에 2xx 응답이 없으면 1분, 5분, 30분, 2시간, 6시간 간격으로 최대 5회 재시도합니다.</p>`;

  bindCopy(page);
  TC.$('#save').onclick = () => {
    const url = TC.$('#url').value.trim();
    if (url && !/^https:\/\//.test(url)) return TC.toast('HTTPS 주소만 등록할 수 있습니다');
    TC.update(st => {
      st.webhook.url = url;
      st.webhook.events = TC.$$('.ev').filter(x => x.checked).map(x => x.value);
      st.webhook.enabled = !!url;
      TC.audit(st, '웹훅 설정 변경', url);
    });
    TC.toast('저장했습니다');
    viewWebhook();
  };
  TC.$('#reveal').onclick = e => {
    const el = TC.$('#sec');
    const shown = el.textContent === wh.secret;
    el.textContent = shown ? TC.mask(wh.secret) : wh.secret;
    e.target.textContent = shown ? '보기' : '숨기기';
    if (!shown) TC.update(st => TC.audit(st, '서명 키 조회'));
  };
  TC.$('#rotate').onclick = async () => {
    if (!await TC.confirm('서명 키 재발급', '기존 키로 서명 검증하는 서버는 새 키로 바꿔야 합니다. 전환 기간 24시간 동안은 두 키로 모두 서명합니다.', '재발급', true)) return;
    TC.update(st => { st.webhook.secret = TC.newSecret(); TC.audit(st, '서명 키 재발급'); });
    viewWebhook();
  };
  TC.$('#send').onclick = async () => {
    const btn = TC.$('#send');
    btn.disabled = true; btn.textContent = '전송 중';
    const r = await deliver(samplePayload(S(), TC.$('#evType').value));
    viewWebhook();
    TC.$('#result').innerHTML = `<div class="notice ${r.ok ? 'ok' : 'err'}"><b>${r.code}</b> ${r.ms}ms ${r.note ? '<br><span class="small">' + r.note + '</span>' : ''}</div>`;
  };
  TC.$$('[data-view]').forEach(b => b.onclick = () => {
    const d = S().deliveries.find(x => x.id === b.dataset.view);
    TC.modal(`<h3>${d.event}</h3>
      <div class="small muted">${TC.esc(d.url)}</div>
      <pre style="margin-top:12px">${Object.entries(d.headers).map(([k, v]) => `${k}: ${TC.esc(v)}`).join('\n')}</pre>
      <pre>${TC.esc(JSON.stringify(JSON.parse(d.body), null, 2))}</pre>
      ${d.note ? `<p class="small muted">${d.note}</p>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button></div>`);
  });
  TC.$$('[data-redo]').forEach(b => b.onclick = async () => {
    const d = S().deliveries.find(x => x.id === b.dataset.redo);
    const p = JSON.parse(d.body);
    p.id = 'evt_' + TC.rand(20);
    await deliver(p);
    viewWebhook();
  });
}

// ---------- Usage ----------
function viewUsage() {
  const s = S();
  const chans = activeChannels(s);
  const days = new Date().getDate();
  const totals = Array.from({ length: days }, (_, i) => ({ date: '', live: 0, test: 0 }));
  chans.forEach(c => (c.usage || []).forEach((d, i) => { if (totals[i]) { totals[i].date = d.date; totals[i][c.env] += d.rooms; } }));
  const max = Math.max(1, ...totals.map(t => t.live + t.test));
  const q = quotaState(s);
  page.innerHTML = head('사용량', '카카오 상담톡 통계 기준 상담방(세션) 수, 매일 04시 집계') + `
    ${q ? `<div class="card" style="margin-bottom:16px">
      <div class="row"><h3 style="margin:0">${q.plan.name} 요금제</h3><span class="spacer"></span><b>${TC.num(q.used)} / ${TC.num(q.plan.quota)}건</b></div>
      <div class="meter ${q.level}" style="height:12px"><div style="width:${q.pct}%"></div></div>
      <p class="muted small" style="margin:8px 0 0">80% 도달 시와 소진 시 ${TC.esc(s.alerts.email)}로 알림을 보냅니다. 소진 시 운영 채널 발송이 중단됩니다.</p>
    </div>` : `<div class="notice">무료 테스트 중입니다. 테스트 채널의 상담방은 과금되지 않습니다.</div>`}
    <div class="card">
      <div class="row"><h3 style="margin:0">일별 상담방</h3><span class="spacer"></span>
        <span class="small"><span class="badge primary">운영</span> <span class="badge warn">테스트</span></span></div>
      ${chans.length ? `<div class="bars">${totals.map(t => `<div class="bar" title="${t.date} 운영 ${t.live} · 테스트 ${t.test}" style="height:${(t.live + t.test) / max * 100}%;background:linear-gradient(to top, var(--primary) ${(t.live / Math.max(1, t.live + t.test)) * 100}%, var(--warn) 0)"></div>`).join('')}</div>
        <div class="bars-x">${totals.map((t, i) => `<span>${(i + 1) % 5 === 1 ? i + 1 : ''}</span>`).join('')}</div>` : '<p class="muted">연결된 채널이 없습니다.</p>'}
    </div>
    <h3 style="margin-top:24px">채널별</h3>
    <div class="table-wrap"><table>
      <tr><th>채널</th><th>환경</th><th>이번 달 상담방</th><th>어제</th></tr>
      ${chans.map(c => { const u = c.usage || []; return `<tr><td>${TC.esc(c.searchId)}</td><td>${envBadge(c.env)}</td><td>${TC.num(u.reduce((a, d) => a + d.rooms, 0))}</td><td>${u.length > 1 ? u[u.length - 2].rooms : 0}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}
    </table></div>
    <p class="muted small" style="margin-top:12px">과금 기준: 상담원(API)이 메시지를 보낸 세션 1개 = 1건. 같은 세션 안의 메시지 수와 무관하며 시스템 메시지와 발신 취소는 차감에 영향을 주지 않습니다.</p>`;
}

// ---------- Billing ----------
function viewBilling() {
  const s = S();
  const b = s.billing;
  page.innerHTML = head('요금제·결제', '선불 월 요금제, 카드 자동결제 (부가세 별도)') + `
    <div class="notice warn small">카드 자동결제는 2차 오픈(운영 환경)에서 PG 연동 후 제공됩니다. 프로토타입에서는 모의 카드로 흐름만 확인합니다.</div>
    <div class="plans">${TC.PLANS.map(p => `
      <div class="card plan ${b.plan === p.id ? 'featured' : ''}">
        <div class="row"><h3 style="margin:0">${p.name}</h3>${b.plan === p.id ? '<span class="badge primary">현재</span>' : ''}</div>
        <div class="price">${TC.num(p.price / 10000)}만원<small> / 월</small></div>
        <ul><li>상담방 ${TC.num(p.quota)}건</li><li>건당 ${p.unit}원</li></ul>
        ${b.plan === p.id ? '<button class="btn block" disabled>사용중</button>' : `<button class="btn block primary" data-plan="${p.id}">${b.plan ? '변경' : '선택'}</button>`}
      </div>`).join('')}
      <div class="card plan"><h3>Enterprise</h3><div class="price" style="font-size:20px">별도 협의</div>
        <ul><li>월 1,000건 초과</li><li>후불·세금계산서</li><li>전용 서버·전담 지원</li></ul>
        <a class="btn block" href="mailto:sales@talkconnector.example">도입 문의</a></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>결제 수단</h3>
        ${b.card ? `<dl class="kv"><dt>카드</dt><dd>${b.card.brand} ****-${b.card.last4}</dd><dt>등록일</dt><dd>${TC.fmtDate(b.card.at, false)}</dd><dt>자동 갱신</dt><dd>${b.autoRenew ? '사용' : '사용 안 함'}</dd></dl>
          <div class="row" style="margin-top:12px"><button class="btn sm" id="card">카드 변경</button><button class="btn sm" id="renew">${b.autoRenew ? '자동 갱신 해제' : '자동 갱신 사용'}</button></div>`
          : `<p class="muted">등록된 카드가 없습니다.</p><button class="btn" id="card">카드 등록</button>`}
      </div>
      <div class="card">
        <h3>다음 결제</h3>
        ${b.plan ? `<dl class="kv"><dt>요금제</dt><dd>${TC.plan(b.plan).name}</dd><dt>금액</dt><dd>${TC.won(Math.round(TC.plan(b.plan).price * 1.1))} (VAT 포함)</dd><dt>결제일</dt><dd>${TC.fmtDate(nextCycle(), false)}</dd></dl>`
          : '<p class="muted">요금제를 선택하면 표시됩니다.</p>'}
      </div>
    </div>
    <h3 style="margin-top:24px">결제 내역</h3>
    <div class="table-wrap"><table>
      <tr><th>일시</th><th>내용</th><th>금액</th><th>상태</th><th>영수증</th></tr>
      ${b.history.length ? b.history.map(h => `<tr><td class="small">${TC.fmtDate(h.at)}</td><td>${h.desc}</td><td>${TC.won(h.amount)}</td><td><span class="badge ok">결제 완료</span></td><td><a href="javascript:void(0)" class="small">카드 영수증</a></td></tr>`).join('') : '<tr><td colspan="5" class="muted">결제 내역이 없습니다.</td></tr>'}
    </table></div>`;

  TC.$('#card').onclick = () => cardModal();
  const renew = TC.$('#renew');
  if (renew) renew.onclick = () => { TC.update(st => { st.billing.autoRenew = !st.billing.autoRenew; TC.audit(st, '자동 갱신 변경', String(st.billing.autoRenew)); }); viewBilling(); };
  TC.$$('[data-plan]').forEach(btn => btn.onclick = async () => {
    const p = TC.plan(btn.dataset.plan);
    if (!S().billing.card) { cardModal(() => choosePlan(p)); return; }
    choosePlan(p);
  });
}

const nextCycle = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); d.setHours(4, 0, 0, 0); return d; };

async function choosePlan(p) {
  const cur = S().billing.plan && TC.plan(S().billing.plan);
  const upgrade = !cur || p.price > cur.price;
  const body = upgrade
    ? `${TC.won(Math.round(p.price * 1.1))}(VAT 포함)을 지금 결제하고 상담방 ${TC.num(p.quota)}건을 바로 사용합니다.${cur ? ' 이번 달 남은 기존 건수는 새 요금제에 합산됩니다.' : ''}`
    : `다음 결제일(${TC.fmtDate(nextCycle(), false)})부터 ${p.name} 요금제로 변경됩니다.`;
  if (!await TC.confirm(`${p.name} 요금제`, body, upgrade ? '결제' : '변경 예약')) return;
  TC.update(st => {
    st.billing.plan = p.id;
    if (upgrade) st.billing.history.unshift({ at: Date.now(), desc: `${p.name} 요금제 (${TC.num(p.quota)}건)`, amount: Math.round(p.price * 1.1) });
    TC.audit(st, '요금제 변경', p.name);
  });
  TC.toast(`${p.name} 요금제가 적용되었습니다`);
  viewBilling();
}

function cardModal(after) {
  TC.modal(`<h3>카드 등록 (모의)</h3>
    <p class="muted small">실제 서비스에서는 PG사 결제창에서 등록하며 카드번호는 TalkConnector에 저장되지 않습니다.</p>
    <label class="field"><span>카드번호</span><input type="text" id="cn" inputmode="numeric" value="4111 1111 1111 1111"></label>
    <div class="grid grid-2" style="gap:12px"><label class="field"><span>유효기간</span><input type="text" value="12/29"></label><label class="field"><span>생년월일 또는 사업자번호</span><input type="text" value="${TC.esc(S().company.bizNo)}"></label></div>
    <label class="check"><input type="checkbox" id="agr" checked><span>정기결제 및 자동 갱신에 동의합니다.</span></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="ok">등록</button></div>`,
    (m, close) => {
      TC.$('#ok', m).onclick = () => {
        const n = TC.$('#cn', m).value.replace(/\D/g, '');
        if (n.length < 15) return TC.toast('카드번호를 확인해 주세요');
        if (!TC.$('#agr', m).checked) return TC.toast('정기결제 동의가 필요합니다');
        TC.update(st => { st.billing.card = { brand: n[0] === '4' ? 'VISA' : n[0] === '5' ? 'Master' : '국내카드', last4: n.slice(-4), at: Date.now() }; TC.audit(st, '카드 등록', '****' + n.slice(-4)); });
        close();
        after ? after() : viewBilling();
      };
    });
}

// ---------- Settings ----------
function viewSettings() {
  const s = S();
  page.innerHTML = head('설정') + `
    <div class="grid grid-2">
      <div class="card">
        <h3>계정</h3>
        <dl class="kv"><dt>로그인</dt><dd>${s.user.provider === 'google' ? 'Google' : '카카오'}</dd><dt>이름</dt><dd>${TC.esc(s.user.name)}</dd><dt>이메일</dt><dd>${TC.esc(s.user.email)}</dd><dt>약관 동의</dt><dd>${TC.fmtDate(s.consents.at)} <span class="muted small">v${s.consents.version}</span></dd><dt>마케팅 수신</dt><dd>${s.consents.marketing ? '동의' : '미동의'}</dd></dl>
      </div>
      <div class="card">
        <h3>사업자</h3>
        <dl class="kv"><dt>회사명</dt><dd>${TC.esc(s.company.name)}</dd><dt>사업자번호</dt><dd>${TC.esc(s.company.bizNo)}</dd><dt>담당자 휴대폰</dt><dd>${TC.esc(s.company.phone)}</dd><dt>이용 목적</dt><dd>${TC.esc(s.company.purpose)}</dd></dl>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>사용량 알림</h3>
      <label class="check"><input type="checkbox" id="a80" ${s.alerts.at80 ? 'checked' : ''}><span>80% 도달 시 알림</span></label>
      <label class="check"><input type="checkbox" id="a0" ${s.alerts.atZero ? 'checked' : ''}><span>소진(100%) 시 알림</span></label>
      <label class="field"><span>알림 받을 이메일</span><input type="email" id="aMail" value="${TC.esc(s.alerts.email)}"></label>
      <button class="btn sm" id="saveA">저장</button>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>프로토타입 데이터</h3>
      <p class="muted small">이 브라우저에 저장된 모든 데모 데이터를 지우고 가입 화면으로 돌아갑니다.</p>
      <button class="btn danger" id="reset">로그아웃 및 초기화</button>
    </div>`;
  TC.$('#saveA').onclick = () => {
    TC.update(st => { st.alerts = { at80: TC.$('#a80').checked, atZero: TC.$('#a0').checked, email: TC.$('#aMail').value.trim() }; TC.audit(st, '알림 설정 변경'); });
    TC.toast('저장했습니다');
  };
  TC.$('#reset').onclick = async () => {
    if (!await TC.confirm('초기화', '모든 데모 데이터를 삭제합니다.', '삭제', true)) return;
    TC.reset();
    location.href = 'index.html';
  };
}

function viewAudit() {
  const s = S();
  page.innerHTML = head('접근 이력', '키 발급·폐기, 서명 키 조회, 설정 변경 등 주요 작업 기록') + `
    <div class="table-wrap"><table>
      <tr><th>시각</th><th>사용자</th><th>작업</th><th>상세</th></tr>
      ${s.audit.map(a => `<tr><td class="small">${TC.fmtDate(a.at)}</td><td class="small">${TC.esc(a.actor)}</td><td>${TC.esc(a.action)}</td><td class="small muted mono">${TC.esc(a.detail)}</td></tr>`).join('')}
    </table></div>`;
}

// ---------- Router ----------
function route() {
  if (!S() || !S().company) return;
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  TC.$$('#sidebar a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + (parts[0] || '')));
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
  if (!parts.length) return viewDashboard();
  if (parts[0] === 'channels') return parts[1] === 'new' ? viewChannelNew() : parts[1] ? viewChannelDetail(parts[1]) : viewChannels();
  ({ keys: viewKeys, webhook: viewWebhook, usage: viewUsage, billing: viewBilling, settings: viewSettings, audit: viewAudit }[parts[0]] || viewDashboard)();
}
window.addEventListener('hashchange', route);
route();
