// 1회 셋업 도우미: .env 가 없으면 .env.example 에서 만들고 다음 단계를 안내한다.
// (크로스 플랫폼: Windows/mac/Linux 동일하게 `npm run setup`)
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, '.env');
const EXAMPLE = path.join(HERE, '.env.example');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const created = !(await exists(ENV));
if (created) {
  await fs.copyFile(EXAMPLE, ENV);
}

console.log(`
✅ 셋업 준비 ${created ? '완료 — collector/.env 를 새로 만들었습니다.' : '확인 — collector/.env 가 이미 있습니다.'}

다음 순서대로 진행하세요:

1) collector/.env 를 열어 값 4개만 채우기
     BETMAN_ID            베트맨 아이디
     BETMAN_PW            베트맨 비밀번호
     INGEST_URL           앱 도메인 + /api/odds/ingest (풀 URL)
     ODDS_INGEST_TOKEN    Vercel 에 넣은 그 값과 동일 (⚠️ odds api 키 아님, 전송 비밀번호)

2) 최초 로그인 1회 (창이 뜸 — 캡차 있으면 직접 통과):
     npm run login

3) 실데이터 캡처 (앱 파서 보정용, 1회):
     npm run capture
     → captures/ 의 json 을 보고 betman.ts 필드 보정 (README 참고)

4) 무인 자동 실행:
     npm start                         (이 창에서 계속 돌림)
   또는 PC 꺼도 부팅 시 자동 (권장):
     npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save

설치된 Chrome 을 그대로 사용합니다(별도 브라우저 다운로드 없음).
`);
