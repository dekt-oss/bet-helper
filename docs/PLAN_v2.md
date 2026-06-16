# 구구벳 v2 기획서 — 전(全) 마켓 배당 + 복수게임(조합) 구매

> ## ✅ 구현 현황 (이 PR)
> 백엔드~UI 전 구현 완료. 테스트/lint/타입체크/빌드 통과.
> - **멀티마켓 수집**: `parseBetmanMarkets`(승무패+핸디캡+언더오버), `market_odds` 저장소,
>   ingest 가 전 마켓 저장(승무패는 기존 `odds` 에도 하위호환 저장).
> - **복수게임(조합)**: `BetSlip`/`BetLeg` + 정산 엔진(`settle.ts`) + 슬립 저장소(옛 단일 Bet→1폴 슬립 통합).
> - **UI**: 구매 슬립(장바구니) 패널 + 마켓 셀, 베팅내역 조합 표시, 대시보드/정산 슬립 반영.
> - **Phase 0 매핑(거의 확정)**: 기준선 컬럼은 레포 증거(`collector/inspect.js` 가 실데이터에서 읽는
>   컬럼)로 **`handi` 로 확정**했고 `MARKET_FIELDS` 앞단에 반영했다. 베트맨 proto 는 핸디캡·언더오버
>   모두 `handi` 에 기준선을 두고, U/O 오버/언더 배당은 winAllot/loseAllot 을 재사용한다.
>   나머지 후보키는 구조 변형 대비 폴백이며, 파서는 무예외라 키가 달라도 빈 결과일 뿐이다.
>   (베트맨은 세션 없는 외부 요청을 403 으로 막아 실응답 직접 캡처는 collector 로만 가능 — 현재
>   매핑으로 충분히 동작하며, 다른 회차에서 OU 기준선이 비면 그때 실캡처 1회로 후보키만 보강하면 된다.)


> 대상: 친목 모임 공동 베팅 통합관리 도구(구구벳)의 다음 버전.
> 두 축 — **(1) 베트맨 전 마켓 배당 수집**, **(2) 복수게임(조합·다폴) 구매** — 을
> 실제 베트맨 프로토 승부식 구조에 맞춰 정의한다.
>
> 현재 코드 기준점:
> - 배당 파서 `src/lib/data-sources/betman.ts` → 승무패(1X2)만 통과시킴(`betTypNm==='승무패'`, `betId==='1'`).
> - 타입 `src/lib/types.ts` → `Odds`는 home/draw/away 3-way 고정, `Bet`은 단일 경기·단일 픽.
> - 입력 UI `src/components/BetForm.tsx` → 단폴 전용.
> - 정산 `src/lib/bets/store.ts:listBetsSettled` → 경기 종료 시 단일 픽 적중 여부로 자동 정산.

---

## 0. 실제 베트맨 프로토 "승부식" 구조 정리 (기획 전제)

복수게임 기능을 우리 식으로 지어내지 않으려면 실제 발매 구조를 먼저 못박는다.

### 0.1 게임(마켓) 유형
한 경기(고정된 홈/원정)는 **유형별로 별도 게임번호**로 발매된다. 우리가 다룰 4종:

| 유형 | 베트맨 명칭(`betTypNm`) | 선택지 | 비고 |
|---|---|---|---|
| 승무패 | `승무패` | 승 / 무 / 패 | 현재 지원. 정규시간 기준(`betId='1'`). |
| 핸디캡 | `핸디캡` | 핸디 승 / 무 / 패 | 기준선(예: 홈 −1) 적용 후 승무패. **마핸**=강팀 마이너스 핸디, **플핸**=약팀 플러스 핸디. 베트맨은 정수 핸디 → 무(환급/무승부) 존재. |
| 언더오버 | `언더오버` | 오버 / 언더 | 합산 득점 기준선(예: 2.5, 3.0). 기준이 정수(3.0)면 동점 시 적중특례(환급). |
| (선택) 핸디언더오버 | `핸디캡언더오버` 등 | 〃 | 우선순위 낮음. v2.1 이후. |

> ⚠️ 위 `betTypNm` 문자열과 핸디/기준선 필드명은 **실데이터 확보 후 확정**한다(현재 파서도
> "추정값" 주석 명시). 1차 구현 전에 collector로 gameSlip 원본 1회분을 캡처해 키 목록을 박제한다(§4.1).

### 0.2 핸디캡·언더오버의 라인(line) 개념
- **핸디캡**: 한 게임번호가 하나의 핸디 기준선을 가진다. 홈 기준 정수(…, −2, −1, +1, +2 …).
  결과 판정 = `(홈득점 + 핸디) vs 원정득점` → 승/무/패.
- **언더오버**: 한 게임번호가 하나의 기준선(line)을 가진다. `홈+원정 합산 득점` vs line → 오버/언더,
  같으면(정수 line) 환급.

### 0.3 구매(전표) 구조 — 조합/다폴
- 한 **구매전표(슬립)** 에 여러 **선택(폴, leg)** 을 담는다. 각 폴 = `{경기 + 마켓유형 + 선택지(+라인)}`.
- **총배당 = 각 폴 배당의 곱**. (예: 1.85 × 2.10 × 1.40 = 5.439 → 보통 소수 둘째 자리 표기/절사)
- **당첨금 = 구매금액 × 총배당** (베트맨은 배당·당첨금 상한이 있으나, 우리는 *기록·관리* 도구이므로
  상한은 경고 표시만 하고 강제하지 않는다).
- 한 전표 안에서 **같은 경기를 서로 다른 폴로 중복 선택 불가**(베트맨 규칙). 단 다른 마켓이라도 동일 경기면
  보통 조합 불가 → 본 도구도 "한 전표 = 경기당 1폴" 규칙을 강제한다.
- 폴 수: **단폴(1) 허용 + 다폴(2~N)**. N 상한은 설정값(기본 10)으로 둔다.
- 정산:
  - 모든 폴이 적중(WON) 또는 환급(VOID)이면 전표 WON, `payout = stake × (환급 폴 제외한 배당 곱)`.
  - 한 폴이라도 미적중(LOST)이면 전표 LOST, payout 0.
  - 전 폴 환급이면 전표 VOID(원금 반환).

---

## 1. 데이터 모델 변경

### 1.1 마켓 배당 타입 확장 (`src/lib/types.ts`)
현재 `Odds`(home/draw/away 고정)는 그대로 **유지(하위호환)** 하되, 멀티마켓을 표현하는 새 타입을 추가한다.

```ts
export type MarketType = '1X2' | 'HANDICAP' | 'OU'; // 승무패 / 핸디캡 / 언더오버

/** 한 경기-한 마켓의 배당. 베트맨 게임번호 1개에 대응. */
export interface MarketOdds {
  matchId: string;
  market: MarketType;
  betId?: string;          // 베트맨 게임번호(마켓 식별)
  externalRef?: string;    // "홈|원정" 매칭 복구용
  // 승무패 & 핸디캡(3-way)
  home?: number;           // 승(핸디 적용 후)
  draw?: number;           // 무
  away?: number;           // 패
  handicap?: number;       // 홈 기준 핸디(HANDICAP 전용, 예: -1)
  // 언더오버
  line?: number;           // 기준선(OU 전용, 예: 2.5)
  over?: number;
  under?: number;
  updatedAt: string;
  source: DataSourceId;
}
```

- 기존 `Odds`는 `1X2`의 축약형으로 본다. 어댑터 `toMarketOdds(odds): MarketOdds`로 흡수해도 되고,
  v2에서 `Odds`를 deprecated 처리하고 화면을 `MarketOdds`로 점진 이전한다.
- `Pick` 표현(픽 키): `'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER'` 로 확장(`Outcome` 슈퍼셋).

### 1.2 전표/폴 타입 (복수게임)
단일 `Bet`을 **전표(BetSlip) + 폴(BetLeg)** 으로 일반화한다. 단폴은 leg 1개짜리 전표로 표현 → 화면/정산 로직 단일화.

```ts
export type LegPick = 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';

export interface BetLeg {
  matchId: string;
  market: MarketType;
  pick: LegPick;
  line?: number;            // 핸디(홈 기준) 또는 OU 기준선 — 정산·표기에 필수
  oddsAtPlacement: number;  // 폴 배당(베팅 시점 고정)
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
}

export interface BetSlip {
  id: string;
  placedBy: string;         // 현행대로 '공동' 기본
  legs: BetLeg[];           // 1개=단폴, 2+=조합
  combinedOdds: number;     // 베팅 시점 총배당(폴 배당 곱)
  stake: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout?: number;
  note?: string;
  createdAt: string;
}
```

#### 하위호환 전략
- 기존 `Bet`(단일)을 즉시 제거하지 않는다. 두 가지 안:
  - **A안(권장)**: `BetSlip`으로 통일하고, 기존 `bets` 레코드를 `legs=[1개]` 슬립으로 읽어 들이는
    어댑터를 store에 둔다. 화면/요약/정산은 전부 슬립 기준으로 재작성.
  - B안: `Bet`(단폴)과 `BetSlip`(조합)을 공존시키고 목록에서 합산. → 정산·요약 코드가 이원화돼 비권장.
- A안 채택 시 마이그레이션은 "읽기 시 변환"으로 무중단 처리 → 과거 `data/bets.json`/Supabase `bets` 그대로 산다.

### 1.3 DB 스키마 (Supabase)
```
bet_slips(
  id uuid pk, placed_by text, combined_odds numeric,
  stake int, status text, payout int null, note text null, created_at timestamptz
)
bet_legs(
  slip_id uuid fk -> bet_slips.id, leg_index int,
  match_id text, market text, pick text, line numeric null,
  odds_at_placement numeric, status text,
  primary key (slip_id, leg_index)
)
market_odds(
  match_id text, market text, betid text null,
  home numeric null, draw numeric null, away numeric null, handicap numeric null,
  line numeric null, over numeric null, under numeric null,
  source text, updated_at timestamptz,
  primary key (match_id, market, coalesce(line,handicap,0))  -- 같은 경기 다중 라인 허용
)
```
- 기존 `odds`(1X2 단일) 테이블은 유지하되 `market_odds`로 점진 이관. 폴백 JSON도 `data/market-odds.json` 추가.
- 정산은 종료 경기의 **스코어**만 있으면 모든 마켓을 계산 가능(§3) → odds 테이블 의존 없음.

---

## 2. 베트맨 데이터 수집 확장

### 2.1 파서 변경 (`parseBetmanGameSlip`)
현재 §`betman.ts:228~232`의 3개 필터 중 마켓 한정 필터를 **제거/분기**한다.

- 유지: `itemCode==='SC'`(축구), `leagueName` 월드컵 필터, `betId` 정규시간(전반전 제외).
- 변경: `betTypNm` 을 버리지 말고 분기 →
  - `승무패` → `MarketOdds{market:'1X2', home,draw,away}`
  - `핸디캡` → `MarketOdds{market:'HANDICAP', home,draw,away, handicap:<라인필드>}`
  - `언더오버` → `MarketOdds{market:'OU', line:<기준선필드>, over,under}`
- 핸디 라인/기준선/오버·언더 배당 컬럼명은 gameSlip `keys`에서 신규로 인덱싱(아래 §4.1 매핑표로 확정).
- 출력은 `MarketOdds[]`. `matchOddsToMatches()`는 그대로 팀쌍 매칭(마켓 무관) 재사용.
- 순수 함수·무예외 원칙(절대 throw 안 함, 실패 시 빈 배열) 유지.

### 2.2 ingest/store 변경
- `POST /api/odds/ingest` → `parseBetmanGameSlip`이 반환한 `MarketOdds[]`를 `upsertMarketOdds()`로 저장.
- collector(`collector/collect.js`)는 **응답 원본을 그대로 전송**하므로 코드 변경 거의 없음.
  단, 라운드 내 모든 게임유형이 한 gameSlip 응답에 들어오는지 확인(보통 들어옴). 안 들어오면 유형별 호출 추가.

### 2.3 화면 노출
- 경기 보드(`MatchBoard`/`MatchList`)에서 경기 행 클릭 → 해당 경기의 **마켓 탭**(승무패 / 핸디캡 / 언더오버) 노출.
- 각 마켓은 배당 셀로 표시(핸디캡은 `−1` 같은 라인 뱃지, 언더오버는 `O 2.5` / `U 2.5`).
- 셀 클릭 = "이 선택을 전표에 담기"(§3 슬립).

---

## 3. 복수게임(조합) 구매 — 핵심 UX

### 3.1 베팅 슬립(장바구니) 패턴 — "따로 뜨는 창"
사용자 요청("여러 개 묶었을 때 배당률·총합 배당을 볼 수 있는 창")을 **베팅 슬립** 으로 구현.

- 경기/배당 화면에서 배당 셀을 클릭하면 우측(데스크탑) / 하단 시트(모바일)에 **슬립 패널**이 뜬다.
- 슬립 패널 구성:
  - 담긴 폴 목록: `경기명 · 마켓 · 선택지(+라인) · 폴배당` + 폴 삭제 버튼.
  - **총배당**: 폴 배당 실시간 곱. (예: 폴 3개 → `5.44`)
  - **구매금액 입력**: 1,000원 단위(현행 BetForm 관례 유지).
  - **예상 적중금**: `구매금액 × 총배당`, 예상 수익(`적중금 − 구매금액`) 동시 표기.
  - 경고: 같은 경기 중복 담기 차단, 폴 0개면 구매 비활성, (선택) 베트맨 배당/당첨금 상한 초과 시 노란 경고.
  - "구매 확정" → `BetSlip` 생성(POST).
- 단폴도 동일 슬립으로 처리(폴 1개). 기존 `BetForm`(단폴 전용)은 **슬립 패널로 흡수**하고 별도 폼은 제거(§5-2 확정).

### 3.2 상태 관리
- 슬립은 클라이언트 임시 상태(React context/zustand). 새로고침 보존 위해 localStorage 동기화 권장.
- 폴 추가 시 그 시점 배당을 캡처(셀에 표시된 배당). 구매 확정 시 `oddsAtPlacement`로 고정.

### 3.3 API
- `POST /api/slips` body: `{ legs: [{matchId, market, pick, line?, oddsAtPlacement}], stake, note? }`
  - 서버 검증: 폴 1개 이상, 경기 중복 없음, 각 배당>0, stake>0, pick∈마켓 허용 선택지.
  - `combinedOdds = round2(∏ oddsAtPlacement)` 서버에서 재계산(클라 신뢰 안 함).
  - status `PENDING`으로 저장.
- `GET /api/slips` → 슬립 목록 + 요약(총 구매액/적중금/손익/적중률, 폴 평균 등).
- `PATCH /api/slips/:id` → 수동 정산/메모/VOID.
- `DELETE /api/slips/:id`.

### 3.4 정산 로직 (`listSlipsSettled`)
경기 종료 스코어로 **폴 단위 판정** 후 전표 집계.

```
판정(leg):
  1X2:      홈>원정→HOME, 동점→DRAW, 홈<원정→AWAY
  HANDICAP: (홈+handicap) vs 원정 동일 비교. 동률→DRAW(환급/무 여부는 베트맨 규칙대로)
  OU:       (홈+원정) vs line → 초과 OVER / 미만 UNDER / 동일(정수 line)→VOID(환급)
  → leg.pick 과 일치하면 WON, 환급케이스 VOID, 아니면 LOST. (경기 미종료면 PENDING 유지)

전표 집계:
  any leg LOST            → 전표 LOST, payout 0
  all leg WON|VOID        → 전표 WON, payout = round(stake × ∏(WON 폴 배당))   // VOID 폴은 배당 1로
  all leg VOID            → 전표 VOID, payout = stake
  else                    → PENDING (아직 안 끝난 폴 있음)
```

- 현행 `listBetsSettled`의 "조회 시 자동 정산" 패턴을 슬립용으로 그대로 계승.
- 풀 잔고(`pool/balance.ts`)·요약(`summarize`)은 슬립 기준 stake/payout 합산으로 치환(인터페이스 동일하게 유지).

---

## 4. 작업 분해 & 마일스톤

### Phase 0 — 베트맨 실응답 매핑 확정 (선행, 0.5d)
- [ ] collector로 gameSlip 원본 1회분 캡처 → `keys` 전체 + 핸디캡/언더오버 행 샘플 박제(`__fixtures__/betman-markets-sample.json`).
- [ ] `betTypNm` 실제 문자열, 핸디 라인/기준선/오버·언더 배당 컬럼명 확정 → §2.1 매핑표 채움.

### Phase 1 — 멀티마켓 수집 (1.5d)
- [ ] `types.ts`: `MarketType`, `MarketOdds`, `LegPick` 추가.
- [ ] `betman.ts`: `parseBetmanGameSlip` → `MarketOdds[]` 분기 파싱. 픽스처 테스트 추가(1X2/핸디/언오 각 케이스).
- [ ] `odds/store.ts`: `upsertMarketOdds`/`listMarketOdds`(Supabase+JSON). `ingest/route.ts` 연결.
- [ ] 보드 UI에 마켓 탭/셀 노출(읽기 전용 먼저).

### Phase 2 — 슬립 데이터/백엔드 (1.5d)
- [ ] `BetSlip`/`BetLeg` 타입 + `bets/store.ts`에 슬립 store(+기존 Bet→슬립 읽기 어댑터).
- [ ] `/api/slips` CRUD + 서버측 총배당 재계산·검증.
- [ ] `listSlipsSettled` 정산 + `summarize`/`pool/balance` 슬립 기준 이관.
- [ ] 단위 테스트: 총배당 곱, 환급 폴 처리, any-LOST, all-VOID.

### Phase 3 — 슬립 UI(장바구니) (2d)
- [ ] 슬립 컨텍스트(상태+localStorage) + 배당 셀 클릭 → 폴 추가.
- [ ] 슬립 패널(데스크탑 우측/모바일 하단 시트): 폴 목록·총배당·금액·예상적중금·구매 확정.
- [ ] 중복 경기 차단, 폴 삭제, 빈 슬립 비활성.
- [ ] 베팅내역 화면(`bets/page.tsx`)을 슬립(다폴 펼침) 표시로 개편.
- [ ] 기존 단폴 `BetForm` 제거(슬립 패널로 대체).

### Phase 4 — 마무리 (0.5d)
- [ ] 상한 경고(선택), 문서화(`DATA_SOURCES.md` 갱신), 마이그레이션 노트.

---

## 5. 확정된 결정 (2026-06-15)
1. **폴 수 상한**: 10폴. (베트맨 관례)
2. **단폴 입력**: 기존 `BetForm`(단폴 전용)을 **슬립 창으로 흡수**한다. 단폴 = 폴 1개 슬립으로
   동일 경로 처리하고, 별도 단폴 폼은 두지 않는다.
3. **공동 vs 개인**: 현행대로 전부 `공동`. 개인별 분리는 별도 과제로 분리.
4. **마켓 범위**: v2 = **승무패 + 핸디캡 + 언더오버 3종**(전부 포함). 희귀 변종(핸디캡언더오버 등)은 v2.1.
5. **배당/당첨금 상한**: 강제하지 않고 경고만(우리는 기록 도구).

---

## 6. 리스크
- **베트맨 응답 구조 불확실**: 핸디/기준선 컬럼명 미확정 → Phase 0에서 실데이터로 박제 후 진행(파서는 무예외라 깨져도 빈 결과).
- **하위호환**: 기존 `Bet`/`odds` 데이터 보존 필요 → "읽기 시 어댑터" 방식으로 무중단.
- **정산 정확도**: 핸디 정수 무·언오 정수 환급 등 엣지 → 픽스처 테스트로 고정.
