# RUIN BLADE VI.17.65 · 4인 온라인 협동 배포 가이드

이 프로젝트는 **브라우저 게임 + Node.js WebSocket 방 서버**를 함께 배포하는 구성입니다.

## 파일 안내
- `index.html` — 실제 게임과 온라인 메뉴 (HTML 파일만 공개하면 온라인 기능은 작동하지 않음)
- `server.js` — 최대 4명이 참가할 수 있는 방 서버
- `package.json` — `npm start` 명령
- `render.yaml` — Render Web Service Blueprint 설정
- `online65.patch.js` — 이번 버전 온라인 패치 참고용 (이미 `index.html`에 반영됨)

## 휴대폰으로 GitHub + Render 배포하기

1. 이 ZIP을 내려받아 압축을 풀고, **폴더 안의 파일들**을 준비합니다. GitHub에 ZIP만 업로드하면 실행되지 않습니다.
2. GitHub에서 `New repository`를 눌러 `ruin-blade-online` 저장소를 만들고, `Add file` → `Upload files`로 `index.html`, `server.js`, `package.json`, `render.yaml` 등의 파일을 저장소 최상단에 업로드합니다.
3. [Render](https://dashboard.render.com/)에서 GitHub 계정을 연결한 뒤 `New` → `Web Service`를 선택합니다.
4. 저장소를 선택하고 Runtime은 Node, Build Command는 `npm install`, Start Command는 `npm start`, Health Check Path는 `/health`로 설정합니다. 사용 가능한 경우 Free instance를 선택할 수 있습니다.
5. 서비스 생성 및 배포가 완료되면 Render에서 발급한 HTTPS 주소로 접속합니다. `https://<실제-서비스명>.onrender.com/health`에서 `ok: true`가 나오면 HTTP 서버가 정상입니다.
6. 게임 타이틀 → **온라인 4인 협동** → **새 방 만들기**. 친구는 같은 사이트에 접속해 방 코드를 입력하거나 공유받은 초대 링크를 엽니다.

**계정 생성/요금제 이용 자격은 각 서비스의 최신 약관을 확인하세요.** 실제 배포 계정과 저장소는 여기서 자동으로 생성되지 않습니다.

## 온라인 기능과 한계
- 1~4명, 6자리 방 코드, 초대 링크, 방 코드 복사, 연결 상태 및 지연시간 확인
- 호스트 브라우저가 몬스터·전투·부활을 계산하고 참가자에게 공유
- 서버는 `/version.json`으로 버전을 전달하고, 페이지는 새 버전 안내를 표시
- 유령 연결은 WebSocket pong 신호를 약 80초 이상 받지 못하면 정리
- 호스트가 나가면 다음 참가자를 호스트로 전환 (복잡한 보스 상태/스킬은 아직 베타)
- 서버 프로세스를 재시작하거나 새 버전을 배포하면 서버 메모리에 있던 방은 없어질 수 있음
- 별도의 사용자 계정/클라우드 저장 없음. 진행 상황은 **현재 도메인의 브라우저 localStorage**에 남음
- 타이틀의 저장 코드 내보내기로 백업 권장. 다른 사이트 주소로 옮기면 저장 정보가 자동 이전되지 않음
- 오프라인 HTML을 바로 열면 싱글플레이는 되지만 온라인은 별도 서버 없이 사용할 수 없음
- 동일 도메인과 서버에 다수의 Render 인스턴스를 돌리는 구성은 지원하지 않음 (방이 서버 메모리에만 있음)

## PC 로컬 서버 테스트

```bash
node --version
npm start
```

주소: `http://localhost:3000`, 서버 상태: `http://localhost:3000/health`. Node.js 20 이상 권장.

## 버전 업데이트

GitHub의 같은 저장소에 새 버전 `index.html`, `server.js` 등 변경된 파일을 업로드/커밋하면 Render 자동 배포 설정에 따라 같은 URL에서 새 버전이 열립니다. 기존 플레이 중에 서버가 재시작되면 연결이 끊길 수 있으므로 사람들이 플레이하지 않을 때 배포하는 것이 안전합니다.

## 문제 해결

- 게임 화면만 뜨고 온라인 연결 실패 → `server.js`와 `package.json`이 포함된 **Web Service**인지 확인, 정적 호스팅에 HTML만 올린 것은 아닌지 확인
- 서버 연결에 시간이 걸림 → 무료 플랜은 장시간 접속이 없을 때 절전 상태에 들어갈 수 있음
- 다른 사람이 참가할 수 없음 → **같은 배포 주소**에 접속했는지, 방 코드를 정확하게 입력했는지, 최대 4명인지 확인
- 새 버전을 올렸는데 구버전 화면 → 브라우저 새로고침, Render Deploy 로그 확인, `/version.json` 확인
- `404` → 주소 끝에 파일 경로 대신 사이트 루트(`/`)를 열었는지 확인
