// 팀 상세 정적 데이터 (FIFA 랭킹 · 감독 · 주요선수).
// ⚠️ worldcup26 API 가 랭킹/선수를 주지 않아 직접 관리하는 스냅샷이다(작성 시점 기준, 부정확하면 이 파일만 수정).
// 키는 한글 팀명(toKoreanTeam 결과). 랭킹은 대략값.

import { toKoreanTeam } from './korea';

export interface TeamInfo {
  fifaRank?: number;
  coach?: string;
  keyPlayers: string[];
}

const INFO: Record<string, TeamInfo> = {
  대한민국: { fifaRank: 23, coach: '홍명보', keyPlayers: ['손흥민', '김민재', '이강인'] },
  브라질: { fifaRank: 5, coach: '안첼로티', keyPlayers: ['비니시우스', '호드리구', '하피냐'] },
  아르헨티나: { fifaRank: 1, coach: '스칼로니', keyPlayers: ['메시', '라우타로', '맥알리스터'] },
  프랑스: { fifaRank: 2, coach: '데샹', keyPlayers: ['음바페', '그리즈만', '추아메니'] },
  스페인: { fifaRank: 3, coach: '데라푸엔테', keyPlayers: ['야말', '로드리', '페드리'] },
  잉글랜드: { fifaRank: 4, coach: '투헬', keyPlayers: ['벨링엄', '케인', '사카'] },
  포르투갈: { fifaRank: 6, coach: '마르티네스', keyPlayers: ['호날두', 'B.페르난데스', 'L.디아스'] },
  네덜란드: { fifaRank: 7, coach: '쿠만', keyPlayers: ['반다이크', '하파엘', '데용'] },
  벨기에: { fifaRank: 8, coach: '가르시아', keyPlayers: ['더브라위너', '루카쿠', '도쿠'] },
  독일: { fifaRank: 9, coach: '나겔스만', keyPlayers: ['무시알라', '비르츠', '킴미히'] },
  크로아티아: { fifaRank: 10, coach: '달리치', keyPlayers: ['모드리치', '코바치치', '그바르디올'] },
  이탈리아: { fifaRank: 11, coach: '스팔레티', keyPlayers: ['바스토니', '키에사', '바렐라'] },
  모로코: { fifaRank: 12, coach: '레그라기', keyPlayers: ['하키미', '지예시', '아믈라흐'] },
  콜롬비아: { fifaRank: 13, coach: '로렌소', keyPlayers: ['J.로드리게스', '루이스 디아스', '두란'] },
  멕시코: { fifaRank: 17, coach: '아기레', keyPlayers: ['로사노', 'E.알바레스', '히메네스'] },
  미국: { fifaRank: 16, coach: '포체티노', keyPlayers: ['풀리식', '무사', '발로건'] },
  우루과이: { fifaRank: 15, coach: '비엘사', keyPlayers: ['누녜스', '발베르데', '아라우호'] },
  일본: { fifaRank: 18, coach: '모리야스', keyPlayers: ['미토마', '쿠보', '카마다'] },
  스위스: { fifaRank: 19, coach: '야킨', keyPlayers: ['샤키리', '아칸지', '엠볼로'] },
  세네갈: { fifaRank: 20, coach: '팡테', keyPlayers: ['마네', '쿨리발리', '코우야테'] },
  덴마크: { fifaRank: 21, coach: '리에마르', keyPlayers: ['에릭센', 'H.안데르센', 'H.회이비에르'] },
  이란: { fifaRank: 18, coach: '케이로스', keyPlayers: ['타레미', '아즈문', '잔쇼'] },
  오스트리아: { fifaRank: 22, coach: '로겐불', keyPlayers: ['알라바', '바움가르트너', '자비처'] },
  에콰도르: { fifaRank: 24, coach: '베카시아치', keyPlayers: ['카이세도', '에스투피냔', 'E.발렌시아'] },
  우크라이나: { fifaRank: 25, coach: '레브로프', keyPlayers: ['진첸코', '무드리크', '도브비크'] },
  호주: { fifaRank: 26, coach: '포포비치', keyPlayers: ['이르빈', '무이', '두케'] },
  튀르키예: { fifaRank: 27, coach: '몬텔라', keyPlayers: ['아르다 귤레르', '찰하노을루', '쿄크추'] },
  세르비아: { fifaRank: 28, coach: '스토일코비치', keyPlayers: ['블라호비치', '미트로비치', 'S.S.사비치'] },
  웨일스: { fifaRank: 29, coach: '윌슨', keyPlayers: ['B.존슨', '램지', 'N.윌리엄스'] },
  폴란드: { fifaRank: 30, coach: '우르반', keyPlayers: ['레반도프스키', '지엘린스키', '슈쳉스니'] },
  파나마: { fifaRank: 31, coach: '크리스티안센', keyPlayers: ['카라스키야', '바르세나스', '고도이'] },
  이집트: { fifaRank: 32, coach: '하산', keyPlayers: ['살라', '엘네니', '트레제게'] },
  알제리: { fifaRank: 33, coach: '프티', keyPlayers: ['마레즈', '벤나세르', '아마우라'] },
  스웨덴: { fifaRank: 34, coach: '톰손', keyPlayers: ['이삭', '쿨루셰프스키', '길러유드'] },
  노르웨이: { fifaRank: 35, coach: '솔바켄', keyPlayers: ['홀란드', '외데고르', '소르로트'] },
  나이지리아: { fifaRank: 36, coach: '셰스타코프', keyPlayers: ['오시멘', '루카쿠', '심욘'] },
  스코틀랜드: { fifaRank: 37, coach: '클라크', keyPlayers: ['로버트슨', 'M.맥토미니', 'J.맥기니'] },
  체코: { fifaRank: 38, coach: '하셰크', keyPlayers: ['소우체크', '시크', '흘로제크'] },
  파라과이: { fifaRank: 39, coach: '알파로', keyPlayers: ['알미론', 'A.산드라', '엔시소'] },
  코트디부아르: { fifaRank: 40, coach: '파에', keyPlayers: ['쿠시', '쿠아시', '아데미'] },
  튀니지: { fifaRank: 41, coach: '카드리', keyPlayers: ['마즈리', 'A.랍비', '스칼리'] },
  카메룬: { fifaRank: 42, coach: '마르크 브리스', keyPlayers: ['오나나', '음벰바', '추파모팅'] },
  코스타리카: { fifaRank: 43, coach: '피게레도', keyPlayers: ['K.월스턴', 'F.칼보', 'A.콘트레라스'] },
  칠레: { fifaRank: 44, coach: '코르도바', keyPlayers: ['A.산체스', '비달', 'B.브레레톤'] },
  남아프리카공화국: { fifaRank: 56, coach: '브루투', keyPlayers: ['음베울레', '폭스', '음코쿠엘리'] },
  우즈베키스탄: { fifaRank: 57, coach: '카파제', keyPlayers: ['숌루도프', '아샤로프', 'A.이브로히모프'] },
  요르단: { fifaRank: 64, coach: '아무타', keyPlayers: ['알타마리', '알나이마트', '하다드'] },
  뉴질랜드: { fifaRank: 86, coach: '하이', keyPlayers: ['우드', '스타멘', '볼드'] },
  카타르: { fifaRank: 53, coach: '로페즈', keyPlayers: ['아피프', '알모에즈 알리', '하템'] },
  사우디아라비아: { fifaRank: 59, coach: '르나르', keyPlayers: ['알도사리', '알불라이히', '캉노'] },
  가나: { fifaRank: 70, coach: '아요레', keyPlayers: ['T.파티', 'M.쿠두스', 'J.아유'] },
  콩고민주공화국: { fifaRank: 60, coach: '데사브르', keyPlayers: ['치미니', '바카요코', '음벰바'] },
  보스니아헤르체고비나: { fifaRank: 74, coach: '바진', keyPlayers: ['지에코', '타치', '데미로비치'] },
  카보베르데: { fifaRank: 73, coach: '브리투', keyPlayers: ['헬데 비아나', '라이언 멘데스', '벨라'] },
  퀴라소: { fifaRank: 90, coach: '아드보카트', keyPlayers: ['바카윈', '바수나', '얀선'] },
  아이티: { fifaRank: 83, coach: '미슈', keyPlayers: ['피에로', '카르데로', '몰레'] },
};

/** 한글/영문 팀명으로 상세정보 조회. 없으면 undefined. */
export function teamInfo(name: string | null | undefined): TeamInfo | undefined {
  return INFO[toKoreanTeam(name)];
}
