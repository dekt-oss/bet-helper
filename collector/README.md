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

## 설치
```bash
cd collector
npm install            # playwright + Chromium 다운로드(앱 빌드와 분리됨)
npx playwright install chromium   # (필요 시) 브라우저 바이너리 설치
cp .env.example .env   # 값 채우기
```

`.env` 필수값:
- `BETMAN_ID`, `BETMAN_PW` — 베트맨 로그인(이 파일에만 둔다. Vercel/GitHub 에 넣지 않음)
- `INGEST_URL` — 예: `https://<앱>.vercel.app/api/odds/ingest`
- `ODDS_INGEST_TOKEN` — **앱 env 의 `ODDS_INGEST_TOKEN` 과 같은 값**

> 앱 쪽 준비: Vercel 앱 env 에 `ODDS_INGEST_TOKEN`(랜덤 32+바이트) 설정 후 재배포.
> 그리고 앱에 Supabase 가 설정돼 있어야 ingest 결과가 영속·실시간 반영된다(Vercel FS 는 임시).

## 처음 한 번: 로그인 시드 + 파서 보정

베트맨 응답 구조는 사이트에서 직접 확인해야 한다(앱 파서 필드는 초기값이 추정치).

1. **로그인 시드(헤드풀)** — 캡차/2FA 가 있어도 직접 통과:
   ```bash
   npm run login        # 브라우저 창이 뜸. 자동 로그인 시도, 실패 시 창에서 직접 로그인
   ```
   성공하면 `betman-session.json`(세션 쿠키)이 저장된다.

2. **실데이터 캡처**:
   ```bash
   npm run capture      # 승부식 페이지를 열어 gameSlip 응답을 captures/ 에 저장(POST 안 함)
   ```
   `captures/gameSlip-*.json` 의 `compSchedules.keys` 배열을 열어 실제 필드명을 확인한다.

3. **앱 파서 보정** — `src/lib/data-sources/betman.ts` 의 `parseBetmanGameSlip` 에서
   키 이름(`homeName/winAllot/...`), 필터 리터럴(`itemCode==='SC'`, `betTypNm==='승무패'`,
   `gameName.includes('월드컵')`), `TEAM_ALIASES` 를 캡처 실데이터에 맞게 수정 후 배포.

### 수동 캡처(브라우저 DevTools) — 대안
1. 베트맨 로그인 → 프로토 승부식 페이지.
2. DevTools → Network → `gameSlip` 필터 → 축구/월드컵 슬립 클릭.
3. 해당 XHR 우클릭 → Copy → Copy response → `captures/manual-sample.json` 으로 저장.

## 운용

- 1회 실행(cron 용): `npm run once`
- 주기 루프(pm2 용): `npm start`  (기본 12분 ± 120초)

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
- **로그인 입력란 못 찾음 / 로그인 실패**: `.env` 의 `BETMAN_*_SELECTOR` 를 DevTools 로 확인해 지정.
  캡차/2FA 면 `npm run login` 으로 수동 통과 후 세션 재사용.
- **gameSlip 캡처 실패**: `BETMAN_PROTO_URL` / `GAMESLIP_URL_MATCH` 를 실제 승부식 XHR 에 맞게 조정.
- **ingest 422**: 승부식 파싱 0건 → `npm run capture` 로 실데이터를 떠서 앱 `betman.ts` 필드 보정.
- **세션 만료**: 다음 사이클에 자동 재로그인. 캡차로 막히면 `npm run login` 재시드.
