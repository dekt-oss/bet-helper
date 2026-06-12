# 데이터 소스 정리 (월드컵 2026 베팅 보조)

이 문서는 bet-helper 가 **가져올 수 있는 정보**와 각 소스의 특징·제약을 정리한 것입니다.
모든 소스는 `src/lib/data-sources/` 에서 우리 공통 타입(`Match`, `Odds`)으로 정규화됩니다.

## 1. 경기 일정 / 조편성 — `openfootball` (기본, 무료, 키 불필요)

- **출처:** [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
  (`2026/worldcup.json`, 퍼블릭 도메인)
- **가져오는 정보:** 전체 경기 일정, 조편성, 라운드, 최종 스코어
- **장점:** API 키 불필요, 무제한, 안정적
- **제약:** 실시간 갱신 아님(정적). 분 단위 진행상황·라이브 스코어 없음
- **용도:** 일정/대진표의 **신뢰할 수 있는 기준 데이터(source of truth)**

## 2. 실시간 스코어 / 경기 상태 — `football-data.org` (무료 티어)

- **출처:** [football-data.org](https://www.football-data.org/) — [무료 키 발급](https://www.football-data.org/client/register)
- **가져오는 정보:** 라이브 스코어, 경기 상태(IN_PLAY/PAUSED/FINISHED), 경과 분, 라인업
- **제약:** 무료 티어 **분당 10회** 호출 제한 → 캐시(`revalidate: 30s`) 필수
- **용도:** `football-data` 키가 있으면 일정 데이터 위에 **실시간 상태를 덮어쓰기**.
  키가 없거나 실패하면 자동으로 openfootball 로 폴백 (`src/lib/data-sources/index.ts`)

## 3. (선택) 고빈도 실시간 + 배당 — `API-Football` (유료/제한적 무료)

- **출처:** [api-football.com](https://www.api-football.com/) (`league=1`, `season=2026`)
- **가져오는 정보:** 15초 갱신 경기 이벤트, 통계, **북메이커 배당**
- **제약:** 무료 티어 호출 제한, 본격 사용 시 유료
- **상태:** 아직 미연결. 실시간성/북메이커 배당이 더 필요하면 어댑터 추가 예정
  (`.env` 의 `API_FOOTBALL_KEY` 자리 마련됨)

## 4. 베트맨 승부식 배당 — `betman` 스크래퍼 (한국 합법 토토)

- **출처:** [betman.co.kr](http://betman.co.kr/) — 스포츠토토(프로토 승부식) 공식 사이트
- **가져오는 정보:** 1X2(승/무/패) 배당, 게임번호, 마감시각
- **특성:**
  - 배당은 경기 **약 24시간 전부터 생성**, 변동 시 **10~30분 내 갱신**
  - **공식 공개 API 없음** → HTML/내부 응답 파싱에 의존(구조 변경 시 깨질 수 있음)
- **주의사항:**
  - `robots.txt`/이용약관 준수, 과도한 호출 금지(캐시 10분)
  - **개인적·비상업적** 통합관리 용도로만 사용
  - 현재 `betman.ts` 는 **골격(스텁)** 상태 — 실제 응답 구조 확인 후 `parseBetmanOdds()` 구현 필요
- **활성화:** `.env.local` 에 `ENABLE_BETMAN_SCRAPER=true`

## 5. 수동 입력 — `manual`

- API 가 못 채우는 값(특정 배당, 친구 베팅 정보)은 수동으로 보완
- 베팅내역은 `POST /api/bets` 로 입력, `data/bets.json` 에 저장

---

## 폴백 전략 요약

```
경기 데이터:  football-data(키 있을 때) ──실패시──▶ openfootball(항상 동작)
배당 데이터:  betman(활성화 시) ─[향후]─▶ API-Football
배팅내역:     로컬 JSON (data/bets.json) → 향후 DB 로 교체 가능
```

## 향후 추가 검토 후보

| 정보 | 후보 소스 |
| --- | --- |
| FIFA 랭킹 포인트 | betman 랭킹정보 페이지, openfootball |
| 팀 엠블럼/국기 | football-data `crest`, 정적 에셋 |
| 경기 이벤트(득점/카드) 타임라인 | API-Football `/fixtures/events` |
| 다중 북메이커 배당 비교 | The Odds API, API-Football odds |
