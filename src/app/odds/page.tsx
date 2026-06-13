import { getMatches, getOdds } from '@/lib/data-sources';
import { OddsForm } from '@/components/OddsForm';
import { OddsBoard } from '@/components/OddsBoard';
import { BetmanImport } from '@/components/BetmanImport';
import { AutoRefresh } from '@/components/AutoRefresh';
import { buildMatchOptions } from '@/lib/teams/options';
import { type OddsTriple } from '@/components/BetForm';
import { listOpinions, groupByMatch } from '@/lib/opinions/store';
import { MEMBERS } from '@/lib/pool/config';

export const dynamic = 'force-dynamic';

export default async function OddsPage() {
  const [{ matches }, { odds, scraper, api }, opinions] = await Promise.all([
    getMatches(),
    getOdds(),
    listOpinions(),
  ]);
  const options = buildMatchOptions(matches);
  const opinionsByMatch = groupByMatch(opinions);

  const oddsByMatch: Record<string, OddsTriple> = {};
  for (const o of odds) {
    oddsByMatch[o.matchId] = { home: o.home, draw: o.draw, away: o.away };
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ marginBottom: 4 }}>승부식</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        승/무/패(1X2) · 자동 배당 {api ? '켜짐(The Odds API)' : '꺼짐'}
        {scraper ? ' · 베트맨 스크래퍼 켜짐' : ''} · 경기를 누르면 상세·3인 의견·베팅
      </p>

      {/* 배팅사이트 스타일 보드 — 카드 클릭 시 상세(랭킹/선수)·3인 의견·인라인 베팅 */}
      <OddsBoard
        matches={options}
        oddsByMatch={oddsByMatch}
        opinionsByMatch={opinionsByMatch}
        members={MEMBERS}
      />

      {/* 보조: 베트맨 배당 수동 입력/가져오기 */}
      <details className="odds-tools" style={{ marginTop: 28 }}>
        <summary>배당 직접 입력 / 베트맨 가져오기</summary>
        <p
          className="muted"
          style={{ fontSize: 13, marginTop: 12 }}
        >
          💡 자동 배당(The Odds API)은 해외 북메이커 기준이라 <strong>베트맨 고정배당과 다릅니다</strong>.
          실제 베팅은 베트맨 배당을 입력(또는 베팅 등록 시 수정)하세요. 수동 입력값이 항상 우선합니다.
        </p>
        <BetmanImport />
        <OddsForm matches={options} />
      </details>
    </>
  );
}
