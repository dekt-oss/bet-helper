# ⚽ Bet Helper

월드컵 기간, **친구들끼리 모은 공동 자금으로 베트맨(스포츠토토 프로토 승부식) 베팅**을
보조하기 위한 웹 기반 통합 관리 시스템입니다.

경기 일정·실시간 현황·배당·우리 모임의 베팅내역을 한 화면에서 관리하는 것이 목표입니다.

> ⚠️ 한국에서 합법적인 스포츠토토(베트맨) 이용을 **보조·기록**하기 위한 개인용 도구입니다.
> 불법 베팅·사설 사이트와 무관하며, 비상업적/개인적 용도로만 사용하세요.

## 주요 기능

- **대시보드** — 진행중/예정 경기, 모임 자금 손익·적중률 요약
- **경기일정** — 월드컵 2026 전체 일정·조편성·스코어
- **배당** — 베트맨 승부식 1X2 배당 (스크래퍼 연결 시)
- **베팅내역** — 누가/얼마/무엇에 걸었는지 기록하고 적중 정산

## 기술 스택

- [Next.js 14](https://nextjs.org/) (App Router) + TypeScript
- 서버 컴포넌트 + API Routes (별도 백엔드 불필요)
- 데이터 저장: 로컬 JSON (`data/bets.json`) — 추후 DB 로 교체 가능

## 데이터는 어디서 오나요?

`src/lib/data-sources/` 에서 여러 소스를 공통 타입으로 정규화합니다.
자세한 내용은 **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)** 참고.

| 정보 | 소스 | 키 필요 |
| --- | --- | --- |
| 경기 일정/대진 | openfootball/worldcup.json | ❌ |
| 실시간 스코어/상태 | football-data.org | ✅ (무료) |
| 베트맨 승부식 배당 | betman.co.kr 스크래핑 | ❌ (활성화 플래그) |
| 고빈도 실시간/배당 | API-Football (선택) | ✅ |

## 시작하기

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 설정
cp .env.example .env.local
#   → FOOTBALL_DATA_API_KEY 등 입력 (없어도 openfootball 로 동작)

# 3) 개발 서버
npm run dev
# http://localhost:3000
```

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 체크 |
| `npm run lint` | ESLint |

## API 엔드포인트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/matches` | 경기 목록(폴백 포함) |
| GET | `/api/odds` | 베트맨 배당 |
| GET | `/api/bets` | 베팅내역 + 요약 |
| POST | `/api/bets` | 베팅 등록 |
| PATCH | `/api/bets/:id` | 베팅 정산(적중/수령액) |

## 로드맵

- [ ] 베트맨 배당 파서 실제 구현 (`betman.ts`)
- [ ] 경기 ↔ 배당 ↔ 베팅 자동 매칭
- [ ] 베팅 등록/정산 UI 폼
- [ ] 인원별 정산(누가 얼마 넣고 얼마 받을지)
- [ ] DB 전환 (SQLite/Postgres)
- [ ] 실시간 갱신(웹소켓/폴링)
