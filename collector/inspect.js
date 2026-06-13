// compSchedules.keys/datas 를 디코딩해 컬럼명·종목별 샘플 행을 보여준다.
// 사용법:  node inspect.js slip-2.json
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
    console.log('captures 폴더에 파일이 없습니다.');
    process.exit(0);
  }
  file = path.join(dir, entries[0].f);
}

console.log('파일:', file);
const j = JSON.parse(await fs.readFile(file, 'utf-8'));
const cs = j.compSchedules;
if (!cs || !Array.isArray(cs.keys) || !Array.isArray(cs.datas)) {
  console.log('compSchedules.keys/datas 가 없습니다.');
  process.exit(0);
}

const keys = cs.keys;
const datas = cs.datas;
console.log('\n컬럼 수:', keys.length, '/ 행 수:', datas.length);
console.log('\n===== 전체 컬럼명(keys) =====');
console.log(JSON.stringify(keys));

const idx = (k) => keys.indexOf(k);
const decode = (r) => {
  const o = {};
  keys.forEach((k, i) => (o[k] = r[i]));
  return o;
};

// itemCode(종목) 컬럼 추정: 정확히 'itemCode' 우선, 없으면 첫 컬럼.
const itemCol = idx('itemCode') >= 0 ? idx('itemCode') : 0;
const items = [...new Set(datas.map((r) => r[itemCol]))];
console.log('\n===== 종목 코드 분포(컬럼', keys[itemCol], ') =====');
for (const it of items) {
  console.log(`  ${JSON.stringify(it)}: ${datas.filter((r) => r[itemCol] === it).length}행`);
}

// 종목별 첫 행을 디코딩해서 출력(구조 비교용)
console.log('\n===== 종목별 샘플 1행(디코딩) =====');
for (const it of items) {
  const row = datas.find((r) => r[itemCol] === it);
  console.log(`\n■ 종목 ${JSON.stringify(it)}`);
  console.log(JSON.stringify(decode(row), null, 1));
}

// '월드컵' 글자가 어디든 들어간 행 최대 3개(축구 승무패 확인용)
const wc = datas
  .filter((r) => r.some((v) => typeof v === 'string' && v.includes('월드컵')))
  .slice(0, 3);
console.log('\n===== "월드컵" 포함 행 (최대 3개, 디코딩) =====');
if (wc.length === 0) console.log('  (월드컵 글자 포함 행 없음 — 리그명이 다른 형태일 수 있음)');
for (const r of wc) console.log('\n' + JSON.stringify(decode(r), null, 1));
