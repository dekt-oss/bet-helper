# 베트맨 배당 수집기 (collector)

베트맨 승부식(1X2) 배당을 **본인 PC/홈서버(가정용 IP)** 에서 자동으로 가져와
bet-helper 앱(`/api/odds/ingest`)으로 전송하는 헤드리스 에이전트.

## 왜 집에서 돌리나
베트맨은 공개 API 가 없고 **데이터센터 IP(Vercel·GitHub Actions 러너 등)를 차단**한다.
그래서 클라우드에서 직접 못 가져온다. 본인 기기(가정용 IP)에서 **정상 방문자로** 본인 세션
쿠키를 써서 화면에 보이는 배당을 읽어 앱으로 보낸다. 프록시·IP 우회 장치는 쓰지 않는다.

## 구조
```
collect.js  세션복원/자동로그인 → 승부식 페이지 gameSlip.do 응답(raw) 캡처 → POST /api/odds/ingest
앱 쪽:      ingestBetmanRaw → parseBetmanGameSlip → matchOddsToMatches → upsertOdds(Supabase)
            → RealtimeBets 가 화면에 실시간 반영
```
파싱·매칭·저장은 **앱이 전담**한다. 수집기는 raw 만 보낸다.

## 빠른 시작 (복붙용)

> 전제: PC 에 **Chrome 설치됨**(또는 Edge), **Node 18+ 설치됨**.
> 별도 브라우저 다운로드 없음 — 설치된 Chrome 을 그대로 쓴다(가볍다).

```bash
cd collector
npm install        # 가벼움: playwright-core + dotenv 만 (Chromium 다운로드 안 함)
npm run setup      # .env 생성 + 다음 단계 안내
```

그다음 `collector/.env` 에서 **값 2개만** 채운다:
- `INGEST_URL` — 예: `https://<앱>.vercel.app/api/odds/ingest`
- `ODDS_INGEST_TOKEN` — **앱(Vercel) env 의 `ODDS_INGEST_TOKEN` 과 같은 값** (⚠️ the-odds-api 키 아님)

> 베트맨 ID/PW 는 `.env` 에 적지 않는다. 로그인은 아래 `npm run login` 에서 **뜬 창에 직접** 한다
> (셀렉터 추측에 의존하지 않아 더 안정적). 한 번 로그인하면 세션이 저장돼 이후엔 무인 자동.

이어서:
```bash
npm run login      # 1) 크롬 창이 뜸 → 평소처럼 직접 로그인 → 터미널에서 Enter → 세션 저장
npm run capture    # 2) 배당 1회 캡처 → captures/ 의 json 내용을 개발자에게 전달(파서 보정용)
npm start          # 3) 무인 자동 실행(12분±). 창 닫으면 멈춤
```

PC 부팅 시 자동 + 항상 켜두기(권장):
```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
# Windows 부팅 자동시작: `npm i -g pm2-windows-startup && pm2-startup install`
# mac/Linux:            `pm2 startup` 출력 명령 1줄 실행
```

> 앱 쪽 준비(딱 1가지): Vercel 앱 env 에 `ODDS_INGEST_TOKEN`(랜덤 32+바이트) 설정 후 재배포.
> 앱에 Supabase 가 설정돼 있어야 결과가 영속·실시간 반영된다(Vercel FS 는 임시).

## 로그인 동작 방식

베트맨 로그인은 자동입력/인증서 등으로 헤드리스 완전자동이 어렵다. 그래서:
- `npm run login` 이 크롬 창을 띄우고 `betman.co.kr` 메인으로 이동한다.
- **사용자가 평소처럼 직접 로그인**한 뒤, 터미널에서 **Enter** 를 누른다.
- 스크립트가 회원 전용 페이지 접근으로 로그인 여부를 확인하고 `betman-session.json`(세션)을 저장한다.
- 이후 `npm run once`/`npm start` 는 그 세션으로 **무인 자동** 동작한다. 세션이 만료되면 그때만 다시 `npm run login`.

이 방식은 로그인 폼 셀렉터 추측에 의존하지 않아 사이트가 바뀌어도 잘 깨지지 않는다.

### 파서 보정(처음 1회)
앱 파서 필드는 초기값이 추정치다. `npm run capture` 로 뜬 `captures/gameSlip-*.json` 의
`compSchedules.keys` 를 실제값으로 확인해 `src/lib/data-sources/betman.ts` 의
`parseBetmanGameSlip`(키 이름, `itemCode==='SC'`·`betTypNm==='승무패'`·`gameName.includes('월드컵')` 필터,
`TEAM_ALIASES`)를 보정한다. 캡처 json 내용을 개발자에게 전달하면 맞춰준다.

### 수동 캡처(브라우저 DevTools) — 대안
1. 베트맨 로그인 → 프로토 승부식 페이지.
2. DevTools → Network → `gameSlip` 필터 → 축구/월드컵 슬립 클릭.
3. 해당 XHR 우클릭 → Copy → Copy response → `captures/manual-sample.json` 으로 저장.

## 운용

- 1회 실행(cron 용): `npm run once`
- 주기 루프(pm2 용): `npm start`  (기본 2시간 / 경기 12시간 전부터 90분, keep-alive 25분)

### 무중단(자동 회복)
- 매 사이클을 **새 브라우저 + 워치독(기본 210초)** 으로 감싼다. 어떤 작업이 멈춰도(hang) 브라우저를
  **강제 종료(트리킬)** 하고 다음 주기에 회복한다 → 예전처럼 조용히 멈추지 않는다.
- 연속 hang `MAX_FAILS`회 또는 `RESTART_HOURS`마다 `process.exit` → **pm2 가 새 프로세스로 재기동**.
- 매 tick `tick…` 로그가 찍히므로 멈춤 여부를 로그로 바로 확인 가능.
- 조정: `.env` 의 `CYCLE_TIMEOUT_SEC`, `MAX_FAILS`, `RESTART_HOURS`.

> ⚠️ **pm2 자동기동 필수**: 위 회복은 pm2 의 autorestart 에 의존한다. **윈도우는 `pm2 startup` 미지원**이라
> 부팅 후 pm2 가 안 뜰 수 있다 → `npm i -g pm2-windows-startup && pm2-startup install` (또는 작업
> 스케줄러/NSSM)로 **부팅 자동기동을 반드시 설정**해야 진짜 무중단이 된다. `pm2 save` 도 필수.

### cron 예시
```cron
*/12 * * * * cd /abs/path/collector && /usr/bin/node collect.js --once >> collector.log 2>&1
```

### pm2 예시
```bash
pm2 start ecosystem.config.cjs
pm2 logs betman-collector
pm2 save
```

## 보안
- `.env`(자격증명), `betman-session.json`(세션 쿠키), `captures/` 는 `.gitignore` 처리됨 — 커밋 금지.
- 네트워크로 나가는 비밀은 `ODDS_INGEST_TOKEN`(HTTPS) 뿐. 자격증명은 로그에 남기지 않는다.
- 세션 파일은 본인 기기에만 두고 파일 권한을 제한(`chmod 600`)하길 권장.

## 트러블슈팅
- **`로그인이 필요한 메뉴입니다` 화면**: 정상 — 아직 로그인 전이다. 창에서 직접 로그인 후 Enter.
- **세션 없음/만료 에러(`npm start` 시)**: `npm run login` 으로 다시 1회 로그인해 세션을 시드.
- **배당 캡처 실패**: 로그인 후 `.env 의 BETMAN_PROTO_URL` 이 실제 승부식 배당 페이지인지 확인.
  `npm run capture` 는 자동 실패 시 직접 그 페이지로 이동 후 Enter 하면 캡처한다.
- **ingest 422**: 승부식 파싱 0건 → `npm run capture` 의 json 을 개발자에게 전달해 `betman.ts` 보정.
