// TalkConnector internal admin prototype. Demo customers are generated locally.

TC.mountChrome();

const page = document.getElementById('page');
const ADMIN_KEY = 'talkconnector.admin.v1';
const ADMIN = 'ops@talkconnector.example';

const DEMO_COMPANIES = ['한빛커머스', '누리교육', '바른보험대리점', '하늘여행', '온새미로', '다솜헬스케어', '가람소프트', '미르리빙', '라온페이', '별빛몰', '새봄스튜디오', '이음솔루션(재판매)'];

function seedAdmin() {
  const now = Date.now();
  const plans = [null, 'starter', 'basic', 'standard', 'standard', 'pro', 'enterprise'];
  return {
    customers: DEMO_COMPANIES.map((name, i) => {
      const plan = plans[i % plans.length];
      const quota = plan === 'enterprise' ? 3000 : plan ? TC.plan(plan).quota : 0;
      const used = plan ? Math.round(quota * [0.32, 0.85, 1, 0.55, 0.12, 0.7, 0.91][i % 7]) : Math.round(Math.random() * 12);
      return {
        id: 'acc_' + TC.rand(8),
        company: name,
        bizNo: `${200 + i * 37}-${10 + i}-${String(10000 + i * 7919).slice(-5)}`,
        email: `admin${i + 1}@example.com`,
        provider: i % 3 ? 'google' : 'kakao',
        plan,
        enterprise: plan === 'enterprise',
        createdAt: now - (60 - i * 4) * 864e5,
        trialEndsAt: now - (30 - i * 4) * 864e5,
        channels: 1 + (i % 3),
        used, quota,
        status: plan ? (used >= quota && plan !== 'enterprise' ? 'blocked' : 'active') : 'trial',
        reseller: name.includes('재판매'),
      };
    }),
    audit: [{ at: now - 3600e3, actor: ADMIN, action: '관리자 로그인', detail: 'OTP 인증' }],
  };
}

const load = () => { try { return JSON.parse(localStorage.getItem(ADMIN_KEY)); } catch { return null; } };
const save = d => { try { localStorage.setItem(ADMIN_KEY, JSON.stringify(d)); } catch { } mem = d; };
let mem = load() || seedAdmin();
save(mem);

const log = (action, detail) => { mem.audit.unshift({ at: Date.now(), actor: ADMIN, action, detail }); save(mem); };

// The customer signed up in this browser appears as a real row.
function allCustomers() {
  const s = TC.state();
  const list = [...mem.customers];
  if (s && s.company) {
    const live = s.channels.filter(c => c.env === 'live' && c.status === 'active');
    const plan = s.billing.plan;
    const used = live.reduce((a, c) => a + (c.usage || []).reduce((x, d) => x + d.rooms, 0), 0);
    const quota = plan ? TC.plan(plan).quota : 0;
    list.unshift({
      id: 'acc_local', company: s.company.name + ' (이 브라우저)', bizNo: s.company.bizNo, email: s.user.email, provider: s.user.provider,
      plan, enterprise: false, createdAt: s.createdAt, trialEndsAt: s.trial.endsAt, channels: s.channels.length, used, quota,
      status: plan ? (used >= quota ? 'blocked' : 'active') : 'trial', local: true,
    });
  }
  return list;
}

const statusBadge = c => ({
  trial: c.trialEndsAt > Date.now() ? '<span class="badge warn">무료 테스트</span>' : '<span class="badge err">테스트 만료</span>',
  active: c.enterprise ? '<span class="badge primary">Enterprise</span>' : '<span class="badge ok">이용중</span>',
  blocked: '<span class="badge err">소진 중단</span>',
}[c.status]);
const planName = c => c.enterprise ? 'Enterprise' : c.plan ? TC.plan(c.plan).name : 'Free';
const head = (t, d = '') => `<div class="page-head"><div><h1>${t}</h1>${d ? `<p>${d}</p>` : ''}</div></div>`;

function viewHome() {
  const cs = allCustomers();
  const paying = cs.filter(c => c.plan && !c.enterprise);
  const mrr = paying.reduce((a, c) => a + TC.plan(c.plan).price, 0);
  const warn = cs.filter(c => c.quota && c.used / c.quota >= 0.8 && c.used < c.quota);
  const blocked = cs.filter(c => c.status === 'blocked');
  const trialEnding = cs.filter(c => c.status === 'trial' && c.trialEndsAt > Date.now() && c.trialEndsAt - Date.now() < 7 * 864e5);
  page.innerHTML = head('현황', '셀프서비스 고객 전체 요약') + `
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><div class="label">전체 고객</div><div class="value">${cs.length}</div><div class="small muted">무료 ${cs.filter(c => c.status === 'trial').length} · 유료 ${paying.length} · Enterprise ${cs.filter(c => c.enterprise).length}</div></div>
      <div class="card stat"><div class="label">셀프 월 매출 (VAT 별도)</div><div class="value">${TC.won(mrr)}</div></div>
      <div class="card stat"><div class="label">80% 이상 사용</div><div class="value">${warn.length}</div></div>
      <div class="card stat"><div class="label">소진 중단</div><div class="value" style="color:var(--err)">${blocked.length}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>영업 연락 대상</h3>
        ${[...blocked, ...warn].map(c => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${TC.esc(c.company)}</span><span class="spacer"></span><span class="small">${TC.num(c.used)}/${TC.num(c.quota)}</span>${statusBadge(c)}</div>`).join('') || '<p class="muted">없음</p>'}
      </div>
      <div class="card"><h3>7일 안에 무료 테스트 종료</h3>
        ${trialEnding.map(c => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${TC.esc(c.company)}</span><span class="spacer"></span><span class="small muted">${TC.fmtDate(c.trialEndsAt, false)}</span></div>`).join('') || '<p class="muted">없음</p>'}
      </div>
    </div>`;
}

function viewCustomers() {
  const cs = allCustomers();
  page.innerHTML = head('고객', '테스트 연장, Enterprise 예외 처리, 소진 차단 해제') + `
    <input type="text" id="q" placeholder="회사명, 사업자번호, 이메일 검색" style="margin-bottom:12px">
    <div class="table-wrap"><table id="t">
      <tr><th>회사</th><th class="c">사업자번호</th><th class="c">로그인</th><th class="c">요금제</th><th class="r">사용량</th><th class="c">상태</th><th class="c">관리</th></tr>
      ${cs.map(c => `<tr data-q="${TC.esc((c.company + c.bizNo + c.email).toLowerCase())}">
        <td><b>${TC.esc(c.company)}</b>${c.reseller ? ' <span class="badge">재판매</span>' : ''}<div class="small muted">${TC.esc(c.email)}</div></td>
        <td class="c mono small nw">${c.bizNo}</td>
        <td class="c small">${c.provider === 'google' ? 'Google' : '카카오'}</td>
        <td class="c">${planName(c)}</td>
        <td class="r small">${c.quota ? `${TC.num(c.used)} / ${TC.num(c.quota)}<div class="meter ${c.used >= c.quota ? 'err' : c.used / c.quota >= .8 ? 'warn' : ''}" style="width:90px;margin-left:auto"><div style="width:${Math.min(100, c.used / c.quota * 100)}%"></div></div>` : `<span class="muted">테스트 ${c.used}</span>`}</td>
        <td class="c">${statusBadge(c)}</td>
        <td class="c"><button class="btn sm" data-id="${c.id}">관리</button></td></tr>`).join('')}
    </table></div>`;
  TC.$('#q').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    TC.$$('#t tr[data-q]').forEach(r => r.classList.toggle('hidden', q && !r.dataset.q.includes(q)));
  };
  TC.$$('[data-id]').forEach(b => b.onclick = () => manage(b.dataset.id));
}

function manage(id) {
  const c = allCustomers().find(x => x.id === id);
  log('고객 정보 조회', c.company);
  TC.modal(`<h3>${TC.esc(c.company)}</h3>
    <dl class="kv" style="margin-bottom:16px">
      <dt>계정 ID</dt><dd class="mono small">${c.id}</dd>
      <dt>가입일</dt><dd>${TC.fmtDate(c.createdAt, false)}</dd>
      <dt>무료 종료</dt><dd>${TC.fmtDate(c.trialEndsAt, false)}</dd>
      <dt>채널</dt><dd>${c.channels}개</dd>
      <dt>요금제</dt><dd>${planName(c)}</dd>
    </dl>
    <div class="grid" style="gap:8px">
      <button class="btn" data-act="extend">무료 테스트 30일 연장</button>
      <button class="btn" data-act="unblock" ${c.status === 'blocked' ? '' : 'disabled'}>소진 차단 해제 (이번 달 한정)</button>
      <button class="btn" data-act="enterprise">${c.enterprise ? 'Enterprise 해제' : 'Enterprise 전환 (후불, 소진 차단 제외)'}</button>
    </div>
    <p class="muted small" style="margin-top:12px">모든 조치는 관리자 접근 이력에 남습니다.${c.local ? ' 이 브라우저 고객은 연장 조치만 콘솔에 반영됩니다.' : ''}</p>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>닫기</button></div>`,
    (m, close) => TC.$$('[data-act]', m).forEach(b => b.onclick = () => {
      const act = b.dataset.act;
      if (c.local) {
        if (act === 'extend') TC.update(s => { s.trial.endsAt = Math.max(s.trial.endsAt, Date.now()) + 30 * 864e5; TC.audit(s, '무료 테스트 연장', '운영자 조치'); });
      } else {
        const x = mem.customers.find(y => y.id === id);
        if (act === 'extend') { x.trialEndsAt = Math.max(x.trialEndsAt, Date.now()) + 30 * 864e5; if (!x.plan) x.status = 'trial'; }
        if (act === 'unblock') x.status = 'active';
        if (act === 'enterprise') { x.enterprise = !x.enterprise; x.plan = x.enterprise ? 'enterprise' : 'standard'; x.quota = x.enterprise ? 3000 : 500; x.status = 'active'; }
        save(mem);
      }
      log({ extend: '무료 테스트 연장', unblock: '소진 차단 해제', enterprise: 'Enterprise 변경' }[act], c.company);
      close(); TC.toast('처리했습니다'); route();
    }));
}

function viewChannels() {
  const rows = [];
  const s = TC.state();
  if (s) s.channels.forEach(ch => rows.push({ company: s.company.name, ...ch }));
  mem.customers.forEach((c, i) => {
    for (let k = 0; k < c.channels; k++) rows.push({ company: c.company, senderKey: (String(i) + k).padEnd(40, '7c2e9a41'), searchId: '@' + ['brand', 'shop', 'cs'][k] + (i + 1), env: c.plan ? 'live' : 'test', status: 'active', createdAt: c.createdAt });
  });
  page.innerHTML = head('채널', '고객사 채널과 카카오 발신프로필 연결 상태') + `
    <div class="table-wrap"><table>
      <tr><th>고객</th><th>채널</th><th>발신프로필 키</th><th class="c">환경</th><th class="c">상태</th><th class="c">연결일</th></tr>
      ${rows.map(r => `<tr><td>${TC.esc(r.company)}</td><td>${TC.esc(r.searchId)}</td><td class="mono small">${TC.mask(r.senderKey)}</td>
        <td class="c">${r.env === 'live' ? '<span class="badge primary">운영</span>' : '<span class="badge warn">테스트</span>'}</td>
        <td class="c">${r.status === 'active' ? '<span class="badge ok">이용중</span>' : '<span class="badge">중지</span>'}</td>
        <td class="c small nw">${TC.fmtDate(r.createdAt, false)}</td></tr>`).join('')}
    </table></div>`;
}

function viewBilling() {
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const tc = 180 + Math.round(Math.sin(i) * 40 + 40);
    const diff = i === 3 ? 2 : 0;
    days.push({ date: TC.fmtDate(d, false), tc, kakao: tc + diff });
  }
  page.innerHTML = head('과금 집계', '매일 04시 카카오 상담톡 세션 통계와 대조 후 확정') + `
    <div class="notice small">완료 기준: TalkConnector 집계와 카카오 통계가 일치해야 확정합니다. 차이가 있으면 확정을 보류하고 원인을 기록합니다.</div>
    <div class="table-wrap"><table>
      <tr><th class="c">집계일</th><th class="r">TalkConnector 상담방</th><th class="r">카카오 세션 통계</th><th class="r">차이</th><th class="c">상태</th></tr>
      ${days.map(d => `<tr><td class="c nw">${d.date}</td><td class="r">${TC.num(d.tc)}</td><td class="r">${TC.num(d.kakao)}</td><td class="r">${d.kakao - d.tc}</td>
        <td class="c">${d.kakao === d.tc ? '<span class="badge ok">확정</span>' : '<span class="badge warn">확인 필요</span>'}</td></tr>`).join('')}
    </table></div>
    <p class="muted small" style="margin-top:12px">세부 정산(카카오 원가, 재판매사 정산)은 내부 시스템에서 관리하며 이 공개 프로토타입에는 포함하지 않습니다.</p>`;
}

function viewTrials() {
  const cs = allCustomers();
  page.innerHTML = head('무료 이력', '사업자번호 기준 1회. 같은 사업자번호로 재가입하면 무료 테스트가 적용되지 않습니다') + `
    <div class="table-wrap"><table>
      <tr><th class="c">사업자번호</th><th>회사</th><th class="c">무료 시작</th><th class="c">무료 종료</th><th class="c">현재</th></tr>
      ${cs.map(c => `<tr><td class="c mono small nw">${c.bizNo}</td><td>${TC.esc(c.company)}</td><td class="c small nw">${TC.fmtDate(c.createdAt, false)}</td><td class="c small nw">${TC.fmtDate(c.trialEndsAt, false)}</td><td class="c">${statusBadge(c)}</td></tr>`).join('')}
    </table></div>`;
}

function viewAudit() {
  page.innerHTML = head('관리자 접근 이력', '고객 정보 조회와 모든 조치 기록') + `
    <div class="table-wrap"><table>
      <tr><th class="c">시각</th><th>관리자</th><th>작업</th><th>대상</th></tr>
      ${mem.audit.map(a => `<tr><td class="c small nw">${TC.fmtDate(a.at)}</td><td class="small">${a.actor}</td><td>${TC.esc(a.action)}</td><td class="small">${TC.esc(a.detail)}</td></tr>`).join('')}
    </table></div>`;
}

function route() {
  const p = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
  TC.$$('#sidebar a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + p));
  document.getElementById('sidebar').classList.remove('open');
  ({ customers: viewCustomers, channels: viewChannels, billing: viewBilling, trials: viewTrials, audit: viewAudit }[p] || viewHome)();
}
window.addEventListener('hashchange', route);
route();
