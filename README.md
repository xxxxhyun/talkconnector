# TalkConnector

카카오 상담톡 API 셀프서비스 프로토타입. 가입, 채널 연동, 키 발급, 웹훅 테스트, 요금제 결제까지 전체 흐름을 브라우저에서 확인한다.

- 서버 없음. 모든 데이터는 브라우저 localStorage에 저장
- 실제 카카오 채널, 소셜 로그인, PG 결제와 연결되지 않음
- 웹훅 테스트 전송만 실제로 입력한 URL에 HTTP 요청을 보냄

## 화면

| 경로 | 내용 | 기획 차수 |
| --- | --- | --- |
| `index.html` | 서비스 소개, 3단계 이용 방법, 요금제, FAQ | 3차 |
| `login.html` | 구글·카카오 로그인(모의), 약관 동의, 사업자 정보 | 1차 |
| `console.html` | 사용자 콘솔: 대시보드, 채널 연결, API 키, 웹훅, 사용량, 요금제·결제, 설정, 접근 이력 | 1차, 2차 |
| `docs.html` | 웹 API 문서: 인증, 발송, 세션, 업로드, 웹훅, 서명 검증, 오류 코드, 용어집 | 3차 |
| `admin.html` | 운영자 콘솔: 고객, 채널, 과금 집계 대조, 무료 이력, 테스트 연장, Enterprise 예외 | 4차 |
| `terms.html` `privacy.html` | 이용약관, 개인정보 처리방침 초안 | 1차 |

## 데모 순서

1. `login.html`에서 가입 (이름·이메일 직접 입력)
2. 채널 연결 마법사: 검색용 아이디 입력, 화면에 표시된 인증번호 입력, 상담톡 활성화
3. 발급된 채널 ID와 API 키 확인
4. 웹훅 메뉴에서 `https://webhook.site` 주소 등록 후 테스트 이벤트 전송
5. 요금제 선택과 모의 카드 등록, 채널을 운영으로 전환
6. `admin.html`에서 운영자 화면 확인

데이터 초기화: 콘솔 설정 메뉴의 로그아웃 및 초기화.

## API 설계 요약

카카오 상담톡 API를 감싼 자체 규격. 상세는 `docs.html`.

- 인증 `Authorization: Bearer tc_test_...` / `tc_live_...`, 권한 read, write, admin
- 식별자 `channelId`(ch_) 하나로 카카오 `partner_key`, `sender_key` 대체
- 발송 `POST /v1/messages` 하나로 plain, rich 통합, `serial_number`는 서버 생성
- 수신 6종(`/message`, `/reference`, `/expired_session`, `/seen_info`, `/personal_info`, `/cert_result`)을 엔드포인트 1개로 통합, HMAC-SHA256 서명(`X-TC-Signature: t=..,v1=..`)
- 응답 봉투 `{ ok, data | error, requestId }`, 카카오 원본 오류는 `error.kakaoCode`

## 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 실제 개발 시 대체할 부분

| 프로토타입 | 실제 구현 |
| --- | --- |
| localStorage 상태 | 콘솔 백엔드 DB |
| 모의 소셜 로그인 | Google OAuth, 카카오 로그인 |
| 화면에 표시되는 인증번호 | 카카오 채널 인증 토큰 요청 API, 토큰으로 발신프로필 등록 API |
| 상담톡 활성화 버튼 | 상담톡 이용 활성화, 채팅 기능 활성화 API |
| 브라우저에서 웹훅 전송 | 중계서버에서 서명 후 전송, 재시도 큐 |
| 키 원문 브라우저 생성 | 서버 생성, 해시 저장 |
| 모의 카드 등록 | PG 빌링키 발급 |
| 임의 사용량 | 카카오 세션 통계 04시 집계 |
| `api.talkconnector.example` | 정식 도메인 |
