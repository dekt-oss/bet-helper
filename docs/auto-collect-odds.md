# 배당 자동 수집 (GitHub Actions cron → data/odds.json)

구구뱃이 실제 베팅하는 **베트맨 승부식(1X2) 배당**을 추가 호스팅/DB 없이 자동으로 화면에 채우는 경로다.
사용자 본인 브라우저(크롬 확장)에 의존하던 기존 방식(`auto-collect-betman.md`)을 보완하는 **서버측 자동화**다.

## 동작 구조

```
[GitHub Actions cron 6시간마다]                 [구구뱃 앱]
  .github/workflows/odds.yml                      listOdds()  (Supabase 미설정 시 data/odds.json)
   └ npm run odds (scripts/fetch-odds.ts)           └ getOdds() → MatchBoard 에 배당 표시
       1순위 베트맨(fetchBetmanOdds + 매칭)
       2순위 The Odds API(fetchWorldCupOdds)
   └ 값이 바뀌면 data/odds.json 커밋·푸시
```

- 파싱·매칭은 **기존 코드 재사용**(`src/lib/data-sources/betman.ts`, `theOddsApi.ts`). 신규 파싱 로직 없음.
- `scripts/fetch-odds.ts` 는 `index.ts`(React `cache()` 사용 → Node 에서 import 시 throw)를 우회하려고
  소스 모듈을 직접 import 하고 경기 폴백을 재현한다.
- 배당이 실제로 바뀐 경우에만 커밋한다(타임스탬프만 다른 무의미 커밋 방지).

## ⚠️ 베트맨과 IP 차단 — 러너 선택이 핵심

베트맨은 **데이터센터 IP(GitHub-hosted 러너 포함)를 차단**한다. 따라서:

| 러너 | 베트맨 | The Odds API | 비고 |
|---|---|---|---|
| `ubuntu-latest` (기본) | ❌ 대개 차단 | ✅ | The Odds API 가 안정 백본. 국제 북메이커 1X2 표시 |
| `self-hosted` (집 PC, residential IP) | ✅ 실제 베트맨 배당 | ✅ | 베트맨 실배당까지 수집 |

**실제 베트맨 배당**까지 자동 수집하려면, 집의 항상 켜진 PC에 GitHub self-hosted 러너를 등록하고
`odds.yml` 의 `runs-on: ubuntu-latest` → `runs-on: [self-hosted]` 로 바꾼 뒤,
저장소 Variables 에 `ENABLE_BETMAN_SCRAPER=true` 를 둔다. (프록시·IP 우회 장치는 만들지 않는다.)

## 사용자가 직접 할 일 (설정)

1. **The Odds API** 무료 가입(https://the-odds-api.com) → API 키 발급.
2. 저장소 **Settings → Secrets and variables → Actions → Secrets** 에 `THE_ODDS_API_KEY` 추가.
   (선택: 더 좋은 일정/팀명을 원하면 `FOOTBALL_DATA_API_KEY` 도.)
3. **Settings → Actions → General → Workflow permissions = Read and write** 확인(커밋 권한).
4. (선택, 베트맨 실배당) self-hosted 러너 등록 + `runs-on` 변경 + Variables 에 `ENABLE_BETMAN_SCRAPER=true`.
5. 앱 쪽: **Supabase 를 설정하지 않으면** 앱이 커밋된 `data/odds.json` 을 그대로 읽는다(DB 불필요).
   The Odds API 중복 호출을 막으려면 앱 환경변수에는 `THE_ODDS_API_KEY` 를 **두지 않는 것**을 권장
   (수집은 Actions 가 전담).

## 검증

- 수동 실행: 저장소 **Actions → collect-odds → Run workflow**.
- 로그에서 `[fetch-odds] 베트맨: N건` / `The Odds API: N건` 확인.
- 커밋된 `data/odds.json` 확인 → 앱 `/` · `/odds` 에서 배당 노출 확인.
- 로컬 단독 실행: `THE_ODDS_API_KEY=... npm run odds` (외부 네트워크 필요).
