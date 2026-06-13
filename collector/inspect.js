// 캡처 파일 구조 분석기(파서 보정용). captures/ 의 최근 *.json 을 읽는다.
//  - 내용이 JSON 이면 compSchedules 구조를 요약.
//  - 내용이 HTML 이면(=gameSlip.do 가 화면을 줌) 그 안에 박힌 배당 데이터 위치를 탐색.
// 사용법:  node inspect.js   (또는  node inspect.js 파일이름.json)
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(HERE, 'captures');

const arg = process.argv[2];
let file;
if (arg) {
  file = path.isAbsolute(arg) ? arg : path.join(dir, arg);
} else {
  const files = (await fs.readdir(dir).catch(() => []))
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (!files.length) {
    console.log('captures 폴더에 파일이 없습니다. 먼저 npm run capture 를 실행하세요.');
    process.exit(0);
  }
  file = path.join(dir, files[files.length - 1]);
}

console.log('파일:', file);
const text = await fs.readFile(file, 'utf-8');
console.log('길이:', text.length, 'bytes');

// ── JSON 시도 ─────────────────────────────────────────────
let j = null;
try {
  j = JSON.parse(text);
} catch {
  j = null;
}

if (j && j.compSchedules) {
  summarizeJson(j);
  process.exit(0);
}
if (j) {
  console.log('JSON 이지만 compSchedules 없음. 최상위 키:', Object.keys(j));
  console.log(JSON.stringify(j, null, 1).slice(0, 2500));
  process.exit(0);
}

// ── HTML/텍스트 분석 ──────────────────────────────────────
console.log('\n[HTML/텍스트로 판단 — 배당 데이터 위치 탐색]');

// 1) 참조된 데이터 엔드포인트(.do) 목록 — 진짜 JSON 엔드포인트 후보
const dos = [...new Set((text.match(/[\w./?=&-]*\.do\b/g) || []))]
  .filter((u) => !u.startsWith('//cdn'))
  .slice(0, 40);
console.log('\n참조된 *.do (최대 40):');
console.log(JSON.stringify(dos, null, 1));

// 2) 핵심 키워드 등장 횟수
const needles = [
  'compSchedules',
  'winAllot',
  'drawAllot',
  'loseAllot',
  'Allot',
  'homeName',
  'awayName',
  'betTypNm',
  'itemCode',
  'gameName',
  'gmId',
];
console.log('\n키워드 등장 횟수:');
for (const n of needles) {
  const c = text.split(n).length - 1;
  if (c > 0) console.log(`  ${n}: ${c}`);
}

// 3) 가장 중요한 키워드 주변 컨텍스트 출력(구조 파악용)
function firstContext(needle, span = 600) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  return text.slice(Math.max(0, i - 120), i + span);
}
for (const key of ['compSchedules', 'winAllot', 'Allot']) {
  const ctx = firstContext(key);
  if (ctx) {
    console.log(`\n── '${key}' 첫 등장 주변 ──`);
    console.log(ctx);
    break; // 하나만 보여도 구조 파악 충분
  }
}

// 4) 배당 데이터가 들어있을 법한 인라인 <script> 블록(첫 1개) 추출
const scripts = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const dataScript = scripts.find(
  (s) => s.includes('compSchedules') || s.includes('Allot') || s.includes('gameInfo'),
);
if (dataScript) {
  console.log('\n── 배당 추정 <script> 블록 (앞 2000자) ──');
  console.log(dataScript.slice(0, 2000));
} else {
  console.log('\n인라인 script 에서 배당 데이터를 못 찾음 → 별도 XHR 로 올 가능성. (다음 단계 안내 예정)');
}

// ── helpers ───────────────────────────────────────────────
function summarizeJson(j) {
  const cs = j.compSchedules;
  console.log('최상위 키:', Object.keys(j));
  console.log('compSchedules 하위 키:', Object.keys(cs));
  const keys = Array.isArray(cs.keys) ? cs.keys : [];
  const datas = Array.isArray(cs.datas) ? cs.datas : [];
  console.log('keys:', JSON.stringify(keys));
  console.log('datas 행수:', datas.length);
  const idx = (k) => keys.indexOf(k);
  const distinct = (k) => {
    const i = idx(k);
    if (i < 0) return '(그 키 없음)';
    return [...new Set(datas.map((r) => r[i]))].slice(0, 40);
  };
  const decode = (r) => {
    const o = {};
    keys.forEach((k, i) => (o[k] = r[i]));
    return o;
  };
  console.log('itemCode 값들:', JSON.stringify(distinct('itemCode')));
  console.log('betTypNm 값들:', JSON.stringify(distinct('betTypNm')));
  console.log('gameName 값들:', JSON.stringify(distinct('gameName')));
  if (datas[0]) console.log('첫 행:', JSON.stringify(decode(datas[0]), null, 1));
}
