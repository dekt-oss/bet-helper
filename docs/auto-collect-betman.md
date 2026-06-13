> **업데이트(2026-06): 주(主) 무인 경로는 `collector/` 헤드리스 에이전트입니다.**
> 브라우저 탭/확장 없이 집 PC·홈서버에서 자동 로그인→배당 캡처→앱 전송까지 무인 동작합니다.
> 설치·운용은 `collector/README.md` 참고. 아래 크롬 확장 방식은 **대안/폴백**으로 유지합니다.

---

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

## 3. 작업 B — 크롬 확장 (MV3) `extension/`  ✅ 구현됨
사용자 브라우저에서만 동작. **구현 방식은 inject/content 후킹이 아니라, 베트맨 페이지
컨텍스트에서 사용자 세션 쿠키로 gameSlip 을 직접 fetch** 하는 방식으로 단순화함
(same-origin credentialed fetch → 후킹 타이밍 이슈 없음).

### 3-1. `extension/manifest.json`
- `manifest_version: 3`, `permissions: ["alarms","storage","tabs","scripting"]`
- `host_permissions: ["https://*.betman.co.kr/*"]`
- `optional_host_permissions: ["https://*/*","http://*/*"]` — 앱 도메인 접근 권한은 옵션 저장 시 런타임 요청
- `background: { service_worker, type:"module" }`, `options_page`, `action.default_popup`

### 3-2. `extension/background.js` (service worker)
- 설치/시작 시 `chrome.alarms.create(ALARM, { periodInMinutes })` (옵션값, 최소 10분).
- `onAlarm` → 0~120초 jitter 후 `runCollect()`:
  1. `chrome.storage.sync` 에서 `{ ingestUrl, ingestToken, slipApiUrl, slipMethod, slipBody, periodMinutes }` 로드.
  2. `slipApiUrl` 의 origin(베트맨)을 **백그라운드 탭**으로 열고 로딩 완료 대기.
  3. `chrome.scripting.executeScript({ target, func: fetchInPage, args:[slipApiUrl, method, body] })` —
     이 함수가 베트맨 페이지 안(same-origin)에서 `fetch(url,{credentials:'include'})` 로 사용자 쿠키를 써서
     응답 텍스트를 그대로 반환한다(= raw). MAIN-world 후킹 불필요.
  4. raw 를 앱 `ingestUrl` 로 POST(`x-ingest-token`). 결과를 `chrome.storage.local.lastStatus` 에 저장.
  5. 백그라운드 탭 닫기(finally).
- ⚠️ 사용자가 베트맨에 로그인된 세션이 있어야 정상 응답. 자동 로그인 코드는 작성하지 않음.

### 3-3. `extension/options.{html,js}`
- 입력: ingestUrl, ingestToken, slipApiUrl, slipMethod(GET/POST), slipBody, periodMinutes.
- 저장 시 `chrome.permissions.request({ origins:[앱origin/*] })` 로 앱 도메인 권한 요청 → `storage.sync` 저장 → background 에 `RESCHEDULE`.
- slipApiUrl/Body 는 사용자가 베트맨 Network 탭에서 직접 복사해 입력(코드 하드코딩 없음).

### 3-4. `extension/popup.{html,js}`
- `lastStatus`(시각/건수/오류) 표시 + **"지금 수집"**(`COLLECT_NOW`) + 설정 열기.

### 보안
- 확장에 Supabase 키 없음 — 저장은 앱 ingest 가 전담. ingest 토큰으로 무단 주입 차단.
- 파서가 배당 범위(1<n≤100) 검증 → 쓰레기 주입 방어.

### 검증 B
1. `chrome://extensions` → 개발자 모드 → "압축해제된 확장 로드" → `extension/`.
2. 옵션에 ingestUrl/토큰/slipApiUrl(+POST면 본문) 입력, 앱 도메인 권한 허용.
3. 베트맨 **로그인 상태**에서 팝업 "지금 수집" → `✅ N건 저장` → 앱 `/odds`·`/bets` 실시간 반영 확인.
4. 주기 alarm 으로 자동 갱신되는지 background 콘솔 확인.
(자세한 사용법은 `extension/README.md`.)

## 4. 기존 자산 (수정 없음)
- `src/lib/data-sources/betman.ts` — `parseBetmanGameSlip`, `matchOddsToMatches`, 팀 별칭
- `src/lib/odds/store.ts` — `upsertOdds`
- `src/lib/data-sources/index.ts` — `getMatches`, `getOdds`
- `src/components/RealtimeBets.tsx` — Supabase odds 변경을 실시간 구독해 화면 반영
- (참고) `src/lib/odds/actions.ts::importBetmanAction` — ingest 로직의 원본. 수동 붙여넣기 UI(`BetmanImport.tsx`)는 폴백으로 유지.

## 5. 신규/변경 파일 (구현 완료)
| 파일 | 상태 | 내용 |
|---|---|---|
| `src/app/api/odds/ingest/route.ts` | 신규 | 토큰검증 + raw 파싱/매칭/저장 |
| `src/lib/odds/ingest.ts` | 신규 | 코어 헬퍼 `ingestBetmanRaw`, action/route 공유 |
| `src/lib/odds/actions.ts` | 변경 | `importBetmanAction` 이 헬퍼 재사용(중복 제거) |
| `.env.example` | 변경 | `ODDS_INGEST_TOKEN` 추가 (`.env.local`·Vercel env 에도 설정 필요) |
| `extension/manifest.json` | 신규 | MV3 매니페스트 |
| `extension/background.js` | 신규 | alarms + 탭 + same-origin fetch + ingest POST |
| `extension/options.{html,js}` | 신규 | URL/토큰/주기 설정, 앱 도메인 권한 요청 |
| `extension/popup.{html,js}` | 신규 | 상태/수동수집 |
| `extension/README.md` | 신규 | 설치·설정 안내 |

## 6. 완료 기준
- 확장 설치 + 옵션 설정 후, **사용자 개입 없이** 주기마다 odds 가 갱신되고 앱 화면에 실시간 반영된다.
- 서버측에는 어떤 베트맨 자동 fetch/프록시도 없다(수집 주체는 사용자 브라우저뿐).

## 7. 사용자가 직접 해야 할 것 (배포·설정)
1. 앱 환경변수 `ODDS_INGEST_TOKEN` 을 `.env.local` 과 Vercel 프로젝트에 동일 값으로 설정 → 재배포.
2. `chrome://extensions` 에서 `extension/` 압축해제 로드.
3. 확장 옵션에 ingestUrl/토큰/slipApiUrl 입력(베트맨 Network 탭에서 gameSlip 요청 복사).
4. 베트맨 로그인 상태에서 "지금 수집"으로 1회 검증.
