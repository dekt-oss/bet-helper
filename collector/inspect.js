// 캡처 JSON 안에서 "배당(allot)이 든 경기 배열"의 위치와 샘플을 자동으로 찾아준다.
// 사용법:  node inspect.js              (captures/ 의 최근 파일)
//          node inspect.js slip-2.json  (특정 파일)
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
  const entries = await Promise.all(
    (await fs.readdir(dir).catch(() => []))
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => ({ f, m: (await fs.stat(path.join(dir, f))).mtimeMs })),
  );
  entries.sort((a, b) => b.m - a.m);
  if (!entries.length) {
    console.log('captures 폴더에 파일이 없습니다. 먼저 npm run capture 를 실행하세요.');
    process.exit(0);
  }
  file = path.join(dir, entries[0].f);
}

console.log('파일:', file);
const text = await fs.readFile(file, 'utf-8');
console.log('길이:', text.length, 'bytes');

let j;
try {
  j = JSON.parse(text);
} catch {
  console.log('JSON 아님(HTML 등). 앞부분 800자:\n', text.slice(0, 800));
  process.exit(0);
}

console.log('최상위 키:', Object.keys(j));

// allot 류 키를 가진 객체인지
function hasAllot(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return Object.keys(o).some((k) => /allot/i.test(k));
}

// 재귀적으로 "allot 객체들의 배열" 을 찾는다.
const hits = [];
let visited = 0;
function walk(node, p, depth) {
  if (node === null || typeof node !== 'object' || depth > 14 || visited > 200000) return;
  visited++;
  if (Array.isArray(node)) {
    if (node.length && node.some((el) => hasAllot(el))) {
      hits.push({ path: p || '(root)', len: node.length, sample: node.find((el) => hasAllot(el)) });
    }
    for (let i = 0; i < Math.min(node.length, 30); i++) walk(node[i], `${p}[${i}]`, depth + 1);
  } else {
    for (const k of Object.keys(node)) walk(node[k], p ? `${p}.${k}` : k, depth + 1);
  }
}
walk(j, '', 0);

// 중복 경로 정리(같은 배열을 여러 번 못 잡게 path 기준 유니크)
const uniq = [];
const seen = new Set();
for (const h of hits) {
  const key = h.path.replace(/\[\d+\]/g, '[]');
  if (seen.has(key)) continue;
  seen.add(key);
  uniq.push(h);
}

if (uniq.length === 0) {
  console.log('\nallot 키를 가진 배열을 못 찾음. allot 포함 키 일부를 출력:');
  const m = text.match(/"\w*[Aa]llot\w*"\s*:/g) || [];
  console.log([...new Set(m)].slice(0, 30));
  process.exit(0);
}

console.log(`\n배당 배열 후보 ${uniq.length}개 발견:`);
for (const h of uniq) {
  console.log(`\n■ 경로: ${h.path.replace(/\[\d+\]/g, '[]')}   (배열 길이 ${h.len})`);
  console.log('  샘플 한 경기(전체 필드):');
  console.log(JSON.stringify(h.sample, null, 1));
}
