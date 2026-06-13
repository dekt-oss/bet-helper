// 캡처 JSON 의 구조(skeleton)와 배당/경기 핵심 객체를 떠서 보여준다.
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
const text = await fs.readFile(file, 'utf-8');
let j;
try {
  j = JSON.parse(text);
} catch {
  console.log('JSON 아님. 앞부분:\n', text.slice(0, 600));
  process.exit(0);
}

// ── 1) 구조 skeleton (배열은 길이+첫 원소만, 문자열은 잘라서) ──
function describe(node, depth, maxDepth) {
  if (node === null) return 'null';
  const t = typeof node;
  if (t === 'string') return JSON.stringify(node.length > 36 ? node.slice(0, 36) + '…' : node);
  if (t === 'number' || t === 'boolean') return String(node);
  if (Array.isArray(node)) {
    if (node.length === 0) return '[]';
    if (depth >= maxDepth) return `[len ${node.length} …]`;
    return `[len ${node.length}] ` + describe(node[0], depth + 1, maxDepth);
  }
  if (t === 'object') {
    if (depth >= maxDepth) return '{…}';
    const parts = Object.keys(node).map((k) => `${k}: ${describe(node[k], depth + 1, maxDepth)}`);
    return '{ ' + parts.join(', ') + ' }';
  }
  return String(node);
}

console.log('\n===== 구조 skeleton (depth 6) =====');
console.log(describe(j, 0, 6));

// ── 2) 특정 키워드를 키로 가진 객체를 경로와 함께 찾아 전체 출력 ──
function findObjectsWithKey(root, keyNames, max = 2) {
  const out = [];
  let visited = 0;
  function walk(node, p, depth) {
    if (out.length >= max || node === null || typeof node !== 'object' || depth > 16) return;
    if (visited++ > 300000) return;
    if (!Array.isArray(node)) {
      const keys = Object.keys(node);
      if (keyNames.some((kn) => keys.includes(kn))) {
        out.push({ path: p || '(root)', obj: node });
      }
    }
    const ents = Array.isArray(node)
      ? node.slice(0, 40).map((v, i) => [`[${i}]`, v])
      : Object.entries(node);
    for (const [k, v] of ents) walk(v, p ? `${p}.${k}`.replace('.[', '[') : k, depth + 1);
  }
  walk(root, '', 0);
  return out;
}

console.log('\n===== 배당(winAllot) 또는 경기(homeName) 객체 샘플 =====');
const found = findObjectsWithKey(j, ['winAllot', 'homeName', 'matchSeq'], 3);
if (found.length === 0) {
  console.log('winAllot/homeName/matchSeq 키를 가진 객체를 못 찾음.');
} else {
  for (const f of found) {
    console.log(`\n■ 경로: ${f.path}`);
    console.log(JSON.stringify(f.obj, null, 1).slice(0, 2500));
  }
}

// ── 3) compSchedules / protoAllots 구조만 따로 ──
for (const key of ['compSchedules', 'protoAllots']) {
  if (j[key] !== undefined) {
    console.log(`\n===== ${key} 구조 =====`);
    console.log(describe(j[key], 0, 5));
  }
}
