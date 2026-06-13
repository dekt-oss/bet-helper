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

// ── 파서 미리보기: 앱 betman.ts 와 동일 필터로 "추출될 월드컵 승무패 경기" 출력 ──
// 필터: itemCode='SC' AND betTypNm='승무패' AND leagueName 에 '월드컵' 포함.
const c = {
  item: idx('itemCode'),
  league: idx('leagueName'),
  home: idx('homeName'),
  away: idx('awayName'),
  win: idx('winAllot'),
  draw: idx('drawAllot'),
  lose: idx('loseAllot'),
  bet: idx('betTypNm'),
  date: idx('gameDate'),
};
const okOdd = (v) => Number.isFinite(Number(v)) && Number(v) > 1 && Number(v) <= 100;
const extracted = datas.filter(
  (r) =>
    r[c.item] === 'SC' &&
    r[c.bet] === '승무패' &&
    String(r[c.league] ?? '').includes('월드컵') &&
    okOdd(r[c.win]) &&
    okOdd(r[c.draw]) &&
    okOdd(r[c.lose]),
);
console.log(`\n===== 파서가 추출할 월드컵 승무패 경기: ${extracted.length}개 =====`);
for (const r of extracted) {
  const d = c.date >= 0 && r[c.date] ? new Date(r[c.date]).toISOString().slice(0, 16) : '';
  console.log(
    `  ${r[c.home]} vs ${r[c.away]}  →  승 ${r[c.win]} / 무 ${r[c.draw]} / 패 ${r[c.lose]}  (${d})`,
  );
}
