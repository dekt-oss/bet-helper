# 지시서 — 베트맨 승부식 배당 자동 수집 (본인 브라우저 방식)

> 작성일 2026-06-13 / 대상: 구현 담당 세션
> 이 지시서는 **사용자 본인 기기·본인 브라우저에서 정상 방문자로서** 화면에 보이는 배당을
> 본인 앱(`bet-helper`)으로 자동 반영하는 작업이다.

## 0. 경계 (반드시 지킬 선)
- ✅ **사용자 본인 PC/브라우저**에서 실행. 사용자는 베트맨의 정상 방문자다.
- ✅ 요청 빈도는 **사람이 보는 수준**(기본 15분 주기, jitter 포함). 공격적 폴링 금지.
- ❌ **하지 않는 것**: residential/datacenter 프록시, IP 로테이션, 안티봇 무력화, 다수 기기 분산 증폭 — 일절 구현하지 않는다. (차단 "우회" 인프라 금지)
- ⚠️ 베트맨 이용약관 위반 소지 및 규제 도메인 리스크는 **사용자가 인지·감수**하기로 함. 코드에 우회 장치를 넣어 책임을 키우지 않는다.
- 데이터센터(VM/Vercel)에서는 베트맨이 IP를 막으므로 **서버측 자동 fetch는 시도하지 않는다.** 수집 주체는 항상 사용자 브라우저다.

## 1. 전체 구조
```
[사용자 크롬 + 확장(MV3)]                     [Next.js 앱 (Vercel/Supabase)]
  chrome.alarms 15분 주기                          POST /api/odds/ingest
   └ 베트맨 승부식 페이지를 백그라운드 탭으로 갱신        └ parseBetmanGameSlip(raw)
   └ 페이지의 fetch/XHR 후킹으로 gameSlip.do 응답 캡처    └ getMatches() + matchOddsToMatches
   └ raw JSON 을 앱 ingest 로 전송 (X-Ingest-Token)      └ upsertOdds  → Supabase odds
                                                       └ revalidate → RealtimeBets 실시간 반영
```
- 파싱·매칭·저장은 **기존 코드 그대로 재사용**. 신규 로직 최소화, odds 스키마 변경 없음.

## 2. 작업 A — 서버 ingest 라우트 (앱)
신규 파일 `src/app/api/odds/ingest/route.ts`:
- `export const runtime = 'nodejs'`
- `POST` 처리:
  1. 헤더 `x-ingest-token` 을 `process.env.ODDS_INGEST_TOKEN` 과 비교. 불일치 → `401`.
  2. body `{ raw: string }` 파싱. 없으면 `400`.
  3. **기존 `importBetmanAction` 본문 로직 재사용**:
     ```ts
     import { parseBetmanGameSlip, matchOddsToMatches } from '@/lib/data-sources/betman';
     import { getMatches } from '@/lib/data-sources';
     import { upsertOdds } from '@/lib/odds/store';

     const parsed = parseBetmanGameSlip(raw);          // 빈 배열이면 422
     const { matches } = await getMatches();
     const matched = matchOddsToMatches(parsed, matches);
     for (const o of matched) {
       await upsertOdds({ matchId: o.matchId, home: o.home, draw: o.draw, away: o.away });
     }
     return Response.json({ ok: true, count: matched.length });
     ```
  4. 에러는 `try/catch` 로 감싸 `500 { ok:false, error }` 반환. `parseOdd` 범위검증(1<n≤100)은 기존 파서가 수행하므로 쓰레기 주입 방어됨.
- ⚠️ 중복 로직을 줄이려면 `importBetmanAction` 의 코어를 `src/lib/odds/ingest.ts` 의 `ingestBetmanRaw(raw)` 헬퍼로 추출해 action 과 route 가 공유하도록 리팩터(선택, 권장).
- 환경변수: `.env.local` 과 Vercel 프로젝트 env 에 `ODDS_INGEST_TOKEN=<랜덤 32+ 바이트>` 추가. 클라이언트로 노출 금지(`NEXT_PUBLIC_` 아님).

### 검증 A
```bash
# 샘플 gameSlip.do JSON 을 raw 로 전송
curl -X POST http://localhost:3000/api/odds/ingest \
  -H "content-type: application/json" \
  -H "x-ingest-token: $ODDS_INGEST_TOKEN" \
  -d '{"raw": <gameSlip.do 응답 문자열>}'
# → {"ok":true,"count":N}  그리고 Supabase odds 행 생성 확인
```

## 3. 작업 B — 크롬 확장 (MV3) `extension/`
사용자 브라우저에서만 동작. 파일 구성:

### 3-1. `extension/manifest.json`
- `manifest_version: 3`, `name`, `version`
- `permissions`: `["alarms","storage","tabs","scripting"]`
- `host_permissions`: `["https://*.betman.co.kr/*", "<앱 도메인>/*"]`
- `background`: `{ "service_worker": "background.js", "type": "module" }`
- `options_page: "options.html"`, `action: { "default_popup": "popup.html" }`

### 3-2. `extension/background.js` (service worker)
- 설치 시 `chrome.alarms.create('collect', { periodInMinutes: 15 })` (주기는 옵션에서 조정, 최소 10분 권장).
- `chrome.alarms.onAlarm` → `runCollect()`:
  1. `chrome.storage.sync` 에서 `{ ingestUrl, ingestToken, slipUrl }` 로드.
  2. 베트맨 승부식 페이지를 **백그라운드 탭**으로 열기: `chrome.tabs.create({ url: slipUrl, active: false })`.
  3. 해당 탭에서 `chrome.scripting.executeScript({ target, world:'MAIN', files:['inject.js'] })` 로 페이지의 `fetch`/`XMLHttpRequest` 를 후킹.
  4. inject 가 `gameSlip.do` 응답 본문을 캡처해 `window.postMessage` → `content.js` 가 받아 `chrome.runtime.sendMessage({ type:'GAMESLIP', raw })` 로 background 전달.
  5. background 가 raw 를 앱으로 POST:
     ```js
     await fetch(ingestUrl, {
       method: 'POST',
       headers: { 'content-type':'application/json', 'x-ingest-token': ingestToken },
       body: JSON.stringify({ raw }),
     });
     ```
  6. 결과(시각/건수/오류)를 `chrome.storage.local` 에 저장(팝업 표시용). 탭 닫기.
- jitter: `periodInMinutes` 외에 0~120초 랜덤 지연 후 실행해 정확한 주기 고정 회피(점잖은 빈도 유지 목적).

### 3-3. `extension/inject.js` (MAIN world)
- 원본 `window.fetch` 와 `XMLHttpRequest.prototype.open/send` 를 래핑.
- 요청 URL 에 `gameSlip.do` 포함 시 응답 텍스트를 복제(`clone().text()`)해 `window.postMessage({ source:'betman-collector', raw }, '*')`.
- ⚠️ 사용자가 베트맨에 로그인/세션이 있어야 정상 데이터가 응답됨. 로그인은 사용자가 평소 쓰던 브라우저 세션을 그대로 사용(자동 로그인 코드 작성 금지).

### 3-4. `extension/content.js`
- `window.addEventListener('message', ...)` 로 inject 메시지 수신 → `source==='betman-collector'` 면 background 로 relay.

### 3-5. `extension/options.html` + `options.js`
- 입력: 앱 ingest URL(`https://<앱>/api/odds/ingest`), ingest 토큰, 베트맨 승부식 URL(`slipUrl`), 주기(분).
- `chrome.storage.sync` 에 저장. 토큰은 사용자가 직접 붙여넣음(코드에 하드코딩 금지).

### 3-6. `extension/popup.html` + `popup.js`
- 마지막 수집 시각 / 저장 건수 / 최근 오류 표시.
- **"지금 수집"** 버튼 → `chrome.runtime.sendMessage({ type:'COLLECT_NOW' })` → background `runCollect()` 즉시 실행.

### 보안
- 확장에는 **Supabase 키를 절대 두지 않는다.** 저장은 앱 ingest 가 전담.
- ingest 토큰으로 무단 주입 차단. 토큰은 옵션에서 사용자가 입력.

### 검증 B
1. `chrome://extensions` → 개발자 모드 → "압축해제된 확장 로드" → `extension/`.
2. 옵션에 ingest URL/토큰/slipUrl 입력.
3. 베트맨 로그인 상태에서 팝업 "지금 수집" → 앱 odds 행 생성 → `/odds`·`/bets`·경기행 칩 실시간 반영 확인(RealtimeBets).
4. 15분 주기 alarm 으로 자동 갱신되는지 background 콘솔 로그 확인.

## 4. 기존 자산 (수정 없음)
- `src/lib/data-sources/betman.ts` — `parseBetmanGameSlip`, `matchOddsToMatches`, 팀 별칭
- `src/lib/odds/store.ts` — `upsertOdds`
- `src/lib/data-sources/index.ts` — `getMatches`, `getOdds`
- `src/components/RealtimeBets.tsx` — Supabase odds 변경을 실시간 구독해 화면 반영
- (참고) `src/lib/odds/actions.ts::importBetmanAction` — ingest 로직의 원본. 수동 붙여넣기 UI(`BetmanImport.tsx`)는 폴백으로 유지.

## 5. 신규/변경 파일 요약
| 파일 | 내용 |
|---|---|
| `src/app/api/odds/ingest/route.ts` | 신규. 토큰검증 + raw 파싱/매칭/저장 |
| `src/lib/odds/ingest.ts` | (권장) 코어 헬퍼 추출, action/route 공유 |
| `.env.local`, Vercel env | `ODDS_INGEST_TOKEN` 추가 |
| `extension/manifest.json` | 신규 |
| `extension/background.js` | 신규. alarms + 탭 + ingest POST |
| `extension/inject.js` | 신규. gameSlip.do 응답 캡처 |
| `extension/content.js` | 신규. relay |
| `extension/options.{html,js}` | 신규. URL/토큰/주기 설정 |
| `extension/popup.{html,js}` | 신규. 상태/수동수집 |

## 6. 완료 기준
- 확장 설치 + 옵션 설정 후, **사용자 개입 없이** 15분마다 odds 가 갱신되고 앱 화면에 실시간 반영된다.
- 서버측에는 어떤 베트맨 자동 fetch/프록시도 없다(수집 주체는 사용자 브라우저뿐).
