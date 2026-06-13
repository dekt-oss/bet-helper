// 캡처된 gameSlip JSON 구조를 요약 출력한다(파서 보정용).
// 사용법: collector 폴더에서  node inspect.js
// captures/ 의 가장 최근 *.json 을 읽어 핵심 구조만 콘솔에 찍는다(붙여넣기 쉽게).
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
    console.log('captures 폴더에 json 이 없습니다. 먼저 npm run capture 를 실행하세요.');
    process.exit(0);
  }
  file = path.join(dir, files[files.length - 1]);
}

console.log('파일:', file);
const text = await fs.readFile(file, 'utf-8');
let j;
try {
  j = JSON.parse(text);
} catch (e) {
  console.log('JSON 파싱 실패. 앞부분 1500자:\n', text.slice(0, 1500));
  process.exit(0);
}

console.log('최상위 키:', Object.keys(j));

const cs = j.compSchedules;
if (!cs) {
  console.log('\ncompSchedules 가 없습니다. 전체 구조(앞 3000자):');
  console.log(JSON.stringify(j, null, 1).slice(0, 3000));
  process.exit(0);
}

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

console.log('\nitemCode 값들:', JSON.stringify(distinct('itemCode')));
console.log('betTypNm 값들:', JSON.stringify(distinct('betTypNm')));
console.log('gameName 값들:', JSON.stringify(distinct('gameName')));

if (datas[0]) console.log('\n첫 행(디코딩):', JSON.stringify(decode(datas[0]), null, 1));

const gi = idx('gameName');
const wc = datas
  .filter((r) => gi < 0 || String(r[gi] ?? '').includes('월드컵'))
  .slice(0, 3)
  .map(decode);
console.log('\n월드컵 포함 후보 행(최대 3개):', JSON.stringify(wc, null, 1));
