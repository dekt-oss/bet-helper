# Vercel 배포 가이드

친구들과 실시간 공유하려면 앱이 인터넷에 24시간 떠 있어야 합니다.
Next.js 제작사인 **Vercel** 무료(Hobby) 플랜으로 배포합니다.

> ⚠️ Vercel은 서버리스라 로컬 JSON 파일 저장소(`data/bets.json`)가 유지되지 않습니다.
> 따라서 **Supabase 환경변수 설정이 필수**입니다(없으면 데이터가 저장 안 됨).

---

## 0. 사전 준비 (한 번만)

1. **Supabase 스키마 적용**: Supabase 프로젝트 > SQL Editor 에서 `supabase/schema.sql` 실행
   (테이블 + RLS + Realtime + 체코전 시드 생성)
2. **배포 대상 브랜치 결정**: 보통 PR #1 을 `main` 에 머지한 뒤 `main` 을 배포.

## 1. Vercel 프로젝트 생성

1. https://vercel.com 접속 → **GitHub 계정으로 로그인**
2. **Add New… > Project**
3. `dekt-oss/bet-helper` 레포 **Import**
4. Framework Preset: **Next.js** (자동 감지됨) — 빌드/출력 설정은 기본값 그대로
   - Build Command: `next build` (기본)
   - Install Command: `npm install` (기본)

## 2. 환경변수 입력 (가장 중요)

프로젝트 Import 화면의 **Environment Variables** 섹션, 또는
배포 후 **Settings > Environment Variables** 에서 아래를 추가합니다.

| Name | Value | 적용 환경 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon(public) 키 | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role(secret) 키 | **Production 만** (선택) |
| `FOOTBALL_DATA_API_KEY` | football-data 토큰 | (선택) 전체 |
| `ENABLE_BETMAN_SCRAPER` | `true` 또는 `false` | (선택) 전체 |

- `NEXT_PUBLIC_` 접두사 변수는 브라우저에 노출돼도 되는 값입니다(anon 키 + RLS 로 보호).
- `SUPABASE_SERVICE_ROLE_KEY` 는 관리자 키이므로 **Production 서버에서만** 쓰고 절대 `NEXT_PUBLIC_` 으로 만들지 않습니다.
- 값을 바꾸면 **재배포(Redeploy)** 해야 반영됩니다.

## 3. 배포

- **Deploy** 클릭 → 1~2분 후 `https://bet-helper-xxxx.vercel.app` URL 발급
- 이 URL 을 친구들에게 공유하면 폰/PC에서 접속 가능
- 이후 `main` 에 푸시할 때마다 **자동 재배포**됩니다

## 4. 동작 확인

- `/pool` 에서 잔액(체코전 반영 시 193,500원)이 보이면 Supabase 연동 성공
- 한 기기에서 베팅을 등록하면 **다른 기기 화면이 즉시 갱신**(Realtime)되는지 확인

---

## 자주 묻는 것

- **GitHub Actions secrets/variables 에 넣으면 안 되나요?**
  그건 CI(빌드 검사) 워크플로우 전용입니다. 배포된 앱이 읽는 환경변수는
  **Vercel 의 Environment Variables** 에 있어야 합니다(별도 저장소).
- **무료로 충분한가요?** 친구 몇 명 규모면 Vercel Hobby + Supabase Free 로 충분합니다.
- **도메인을 예쁘게?** Vercel Settings > Domains 에서 커스텀 도메인 연결 가능(선택).
