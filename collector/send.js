// captures/ 의 캡처 파일을 앱 /api/odds/ingest 로 직접 전송한다(파이프라인 검증용).
// 사용법:  node send.js              (captures/slip-2.json 기본)
//          node send.js slip-1.json
// .env 의 INGEST_URL, ODDS_INGEST_TOKEN 을 사용한다.
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.INGEST_URL;
const token = process.env.ODDS_INGEST_TOKEN;
if (!url || !token) {
  console.error('필수 환경변수 누락: INGEST_URL, ODDS_INGEST_TOKEN (collector/.env)');
  process.exit(1);
}

const arg = process.argv[2] || 'slip-2.json';
const file = path.isAbsolute(arg) ? arg : path.join(HERE, 'captures', arg);
const raw = await fs.readFile(file, 'utf-8');
console.log(`전송: ${file} (${raw.length} bytes) → ${url}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-token': token },
  body: JSON.stringify({ raw }),
});
const body = await res.json().catch(() => ({}));
console.log('응답 HTTP', res.status, ':', JSON.stringify(body));
if (res.ok && body.ok) {
  console.log(
    `\n✅ 승무패 ${body.count}경기 · 전체 마켓 ${body.marketCount ?? body.count}행(승무패+핸디캡+언더오버) 저장됨.` +
      `\n   marketCount 가 count 보다 크면 핸디/언오까지 수집된 것입니다. 구구뱃 /fixtures 에서 확인하세요.`,
  );
} else if (res.status === 422) {
  console.log('\n⚠️ 422 = 파싱 0건. 앱(브랜치)에 최신 파서가 배포됐는지 확인.');
} else {
  console.log('\n⚠️ 전송 실패. INGEST_URL/토큰/배포 상태 확인.');
}
