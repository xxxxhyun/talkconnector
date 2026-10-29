# TalkConnector

카카오 상담톡 API 셀프서비스 프로토타입. 가입, 채널 연동, 키 발급, 웹훅 테스트, 요금제 결제까지 전체 흐름을 브라우저에서 확인한다.

- 서버 없음. 모든 데이터는 브라우저 localStorage에 저장
- 실제 카카오 채널, 소셜 로그인, PG 결제와 연결되지 않음
- 수신 테스트 전송만 실제로 입력한 도메인에 HTTP 요청을 보냄

## 화면

| 경로 | 내용 | 기획 차수 |
| --- | --- | --- |
| `index.html` | 서비스 소개, 3단계 이용 방법, 요금제, FAQ | 3차 |
| `login.html` | 구글·카카오 로그인(모의), 약관 동의, 사업자 정보 | 1차 |
| `console.html` | 사용자 콘솔: 대시보드, 채널 연결(시스템 메시지 검수 요청), API 토큰, 수신 설정, 사용량, 요금제·결제, 설정, 접근 이력 | 1차, 2차 |
| `docs.html` | 웹 API 문서 (v3 중계 규격): 상담 필수 API, 부가 기능 API, 채널 설정, 결과 코드 | 3차 |
| `admin.html` | 운영자 콘솔: 고객, 채널, 과금 집계 대조, 무료 이력, 테스트 연장, Enterprise 예외 | 4차 |
| `terms.html` `privacy.html` | 이용약관, 개인정보 처리방침 초안 | 1차 |

## 데모 순서

1. `login.html`에서 가입 (이름·이메일 직접 입력)
2. 채널 연결 마법사: 검색용 아이디 입력, 화면에 표시된 인증번호 입력, 상담톡 활성화
3. 발급된 발신프로필 키, API 토큰, Channel Secret 확인
4. 수신 설정 메뉴에서 `https://webhook.site` 주소를 수신 도메인으로 등록 후 테스트 요청 전송
5. 요금제 선택과 모의 카드 등록, 채널을 운영으로 전환
6. `admin.html`에서 운영자 화면 확인

데이터 초기화: 콘솔 설정 메뉴의 로그아웃 및 초기화.

## API 설계 요약

기존 중계 서버 v3 규격을 그대로 따른다. 중계 서버는 고객사 요청을 받아 카카오에 전달하고, 카카오 수신 콜백을 고객사 수신 도메인의 같은 경로로 전달한다. 상세는 `docs.html`.

- 헤더 `X-SenderKey`(발신프로필 키, 채널별), `X-JwtToken`(API 토큰, 계정별 테스트·운영), 일부 API `X-UserKey`
- 상담 필수: `/v3/chat/send/plain`, `/v3/chat/send/rich`, `/v3/image/upload`, `/v3/file/upload`, `/v3/chat/end`
- 부가 기능: `/v3/chat/read`, `/v3/chat/delete`, `/v3/session`, `/v3/chat/extend(/plain|/rich)`, `/v3/profile/user/block|unblock`, `/v3/chat/endWithBot`, `/v3/chat/cert/status`
- 수신: 필수 `/message`, `/reference`, `/expired_session`, 선택 `/personal_info`, `/cert_result`, `/seen_info`
- 수신 서명 `X-Signature`: 클레임 `{ jwtToken: API 토큰 }`을 고객사별 Channel Secret으로 서명한 HS256 JWT
- 응답 `{ code, message, created_at }`, `code` 0이 성공
- 사용량 조회는 내부 운영용이므로 고객 API 문서에서 제외

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
| 브라우저에서 수신 테스트 전송 | 중계서버에서 서명 후 전송 |
| 키·토큰 원문 브라우저 생성 | 서버 생성, 해시 저장 |
| 시스템 메시지 검수 요청 (상태만 변경) | 카카오 시스템 메시지 등록·검수 연동 |
| 모의 카드 등록 | PG 빌링키 발급 |
| 임의 사용량 | 카카오 세션 통계 04시 집계 |
| `api.talkconnector.example` | 정식 도메인 |
