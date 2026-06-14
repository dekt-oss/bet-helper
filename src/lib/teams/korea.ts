// 국가명 한글 변환 + 한국 경기 우선 정렬 유틸.
// openfootball / football-data 는 영문 팀명을 주므로 한글로 바꿔 표시한다.
// 매칭은 소문자·공백제거한 키로 robust 하게.

import type { Match } from '@/lib/types';

// 영문(정규화) → 한글. 월드컵 출전 가능 국가 위주. 없으면 원문 유지.
const KOREAN: Record<string, string> = {
  korearepublic: '대한민국',
  southkorea: '대한민국',
  korea: '대한민국',
  한국: '대한민국',
  brazil: '브라질',
  argentina: '아르헨티나',
  france: '프랑스',
  germany: '독일',
  spain: '스페인',
  england: '잉글랜드',
  portugal: '포르투갈',
  netherlands: '네덜란드',
  italy: '이탈리아',
  belgium: '벨기에',
  croatia: '크로아티아',
  japan: '일본',
  mexico: '멕시코',
  unitedstates: '미국',
  usa: '미국',
  canada: '캐나다',
  uruguay: '우루과이',
  morocco: '모로코',
  switzerland: '스위스',
  denmark: '덴마크',
  poland: '폴란드',
  senegal: '세네갈',
  australia: '호주',
  iran: '이란',
  iriran: '이란',
  saudiarabia: '사우디아라비아',
  qatar: '카타르',
  ecuador: '에콰도르',
  ghana: '가나',
  serbia: '세르비아',
  cameroon: '카메룬',
  tunisia: '튀니지',
  costarica: '코스타리카',
  wales: '웨일스',
  colombia: '콜롬비아',
  peru: '페루',
  nigeria: '나이지리아',
  egypt: '이집트',
  algeria: '알제리',
  sweden: '스웨덴',
  norway: '노르웨이',
  austria: '오스트리아',
  ukraine: '우크라이나',
  turkey: '튀르키예',
  türkiye: '튀르키예',
  turkiye: '튀르키예',
  scotland: '스코틀랜드',
  czechia: '체코',
  czechrepublic: '체코',
  hungary: '헝가리',
  greece: '그리스',
  romania: '루마니아',
  ivorycoast: '코트디부아르',
  cotedivoire: '코트디부아르',
  mali: '말리',
  southafrica: '남아프리카공화국',
  newzealand: '뉴질랜드',
  jordan: '요르단',
  uzbekistan: '우즈베키스탄',
  paraguay: '파라과이',
  chile: '칠레',
  panama: '파나마',
  honduras: '온두라스',
  jamaica: '자메이카',
  capeverde: '카보베르데',
  curacao: '퀴라소',
  haiti: '아이티',
  iraq: '이라크',
  uae: '아랍에미리트',
  unitedarabemirates: '아랍에미리트',
  oman: '오만',
  bahrain: '바레인',
  palestine: '팔레스타인',
  venezuela: '베네수엘라',
  bolivia: '볼리비아',
  slovakia: '슬로바키아',
  slovenia: '슬로베니아',
  finland: '핀란드',
  drcongo: '콩고민주공화국',
  congodr: '콩고민주공화국',
  democraticrepublicofthecongo: '콩고민주공화국',
  bosniaherzegovina: '보스니아헤르체고비나',
  bosniaandherzegovina: '보스니아헤르체고비나',
};

function normalize(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD') // 악센트 분리 후
    .replace(/[̀-ͯ]/g, '') // 발음기호 제거(Curaçao→curacao, Türkiye→turkiye)
    .normalize('NFC') // 한글은 다시 결합(자모 분해 방지)
    .replace(/&/g, 'and')
    .replace(/[\s.'’-]/g, '');
}

/** 영문/혼합 팀명을 한글로. 매핑에 없으면 원문, 비어있으면 '미정'. */
export function toKoreanTeam(name: string | null | undefined): string {
  if (!name) return '미정';
  return KOREAN[normalize(name)] ?? name;
}

/** 한국(대한민국) 팀인지 — 코드(KOR) 또는 이름으로 판별. */
export function isKoreaTeam(
  name: string | null | undefined,
  code?: string | null,
): boolean {
  if (code && code.toUpperCase() === 'KOR') return true;
  return ['korearepublic', 'southkorea', 'korea'].includes(normalize(name));
}

/** 경기에 한국이 포함됐는지. */
export function isKoreaMatch(m: Match): boolean {
  return (
    isKoreaTeam(m.home.name, m.home.code) ||
    isKoreaTeam(m.away.name, m.away.code)
  );
}

/** 한국 경기를 맨 위로, 그다음 킥오프 시간순으로 정렬한 새 배열 반환. */
export function sortKoreaFirst(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    const ak = isKoreaMatch(a) ? 0 : 1;
    const bk = isKoreaMatch(b) ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.kickoff.localeCompare(b.kickoff);
  });
}

/** 경기를 "한글홈 vs 한글원정" 라벨로. */
export function matchLabel(m: Match): string {
  return `${toKoreanTeam(m.home.name)} vs ${toKoreanTeam(m.away.name)}`;
}

/** "Group A" / "GROUP_A" / "A" → "A조". 매칭 안 되면 원문. */
export function koreanGroupName(stage: string | undefined | null): string {
  if (!stage) return '';
  const m =
    stage.match(/group[\s_]*([a-l])/i) || stage.match(/^\s*([a-l])\s*조?$/i);
  return m ? `${m[1].toUpperCase()}조` : stage;
}

/** 서로 다른 소스의 팀명을 같은 기준으로 비교하기 위한 표준 키(한글 별칭 통일). */
export function teamCanon(name: string | null | undefined): string {
  return toKoreanTeam(name);
}

/**
 * 데이터 소스가 바뀌어도 같은 경기면 같은 값을 주는 "안정적 경기 ID".
 * - 팀명을 표준화(teamCanon)해 만들므로 worldcup26/openfootball/football-data 가
 *   서로 달라도 동일 ID 가 된다 → 저장한 의견·배당이 소스 전환에도 유지된다.
 * - 팀을 식별하지 못하면(미정/빈값) null 을 반환 → 호출부가 소스 고유 ID 로 폴백.
 *   (미정 경기끼리 같은 ID 로 합쳐지는 것을 방지)
 */
export function stableMatchId(
  home: string | null | undefined,
  away: string | null | undefined,
): string | null {
  const a = teamCanon(home);
  const b = teamCanon(away);
  if (!a || !b || a === '미정' || b === '미정') return null;
  const slug = (s: string) => s.replace(/[\s.'’\-]/g, '').toLowerCase();
  return `wc-${[slug(a), slug(b)].sort().join('--')}`;
}

