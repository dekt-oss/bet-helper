// 베트맨(betman.co.kr) 배당 스크래퍼 — 한국 합법 스포츠토토(프로토 승부식) 배당.
//
// ⚠️ 주의:
//  - 베트맨은 공식 공개 API 가 없어 HTML/내부 JSON 응답 파싱에 의존한다.
//    사이트 구조가 바뀌면 깨질 수 있으므로 selector/엔드포인트를 한 곳(여기)에 모은다.
//  - 배당은 경기 ~24시간 전부터 생성되고, 변동 시 10~30분 내 갱신된다.
//  - robots.txt / 이용약관을 준수하고, 과도한 호출을 피하기 위해 캐시를 둔다.
//  - 개인적/비상업적 통합관리 용도로만 사용한다.
//
// 현재는 동작 골격(스텁)만 제공한다. 실제 파싱 로직은 베트맨 응답 구조를
// 확인한 뒤 parseBetmanOdds() 안에 채운다.

import type { Odds } from '@/lib/types';

export function isBetmanEnabled(): boolean {
  return process.env.ENABLE_BETMAN_SCRAPER === 'true';
}

/**
 * 베트맨에서 월드컵 승부식(1X2) 배당을 가져온다.
 * matchHints: 팀명 등으로 우리 Match 와 매칭하기 위한 힌트.
 */
export async function fetchBetmanOdds(): Promise<Odds[]> {
  if (!isBetmanEnabled()) {
    // 비활성화 상태에서는 조용히 빈 배열 반환 (다른 소스로 폴백)
    return [];
  }

  // TODO: 실제 엔드포인트 확인 후 구현.
  // 예시 흐름:
  //   1) 프로토 승부식 목록 페이지/내부 API 호출
  //   2) 월드컵 경기만 필터
  //   3) parseBetmanOdds() 로 정규화
  //
  // const res = await fetch(BETMAN_PROTO_LIST_URL, {
  //   headers: { 'User-Agent': '...', Referer: 'https://www.betman.co.kr/' },
  //   next: { revalidate: 600 }, // 10분 캐시
  // });
  // const html = await res.text();
  // return parseBetmanOdds(html);

  return [];
}

/** 베트맨 응답(HTML 또는 JSON 문자열)을 Odds[] 로 정규화. */
export function parseBetmanOdds(_raw: string): Odds[] {
  // TODO: cheerio 등으로 파싱. 구조 확정 전까지 빈 배열.
  return [];
}
