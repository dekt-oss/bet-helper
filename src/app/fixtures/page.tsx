import { getMatches, getOdds } from '@/lib/data-sources';
import { type OddsTriple } from '@/components/MatchList';
import { FixturesView } from '@/components/FixturesView';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function FixturesPage() {
  const [{ matches, source }, { odds, api }] = await Promise.all([
    getMatches(),
    getOdds(),
  ]);

  const oddsByMatch: Record<string, OddsTriple> = {};
  for (const o of odds)
    oddsByMatch[o.matchId] = { home: o.home, draw: o.draw, away: o.away };

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
        <h1 style={{ marginBottom: 4 }}>경기일정</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        총 {matches.length}경기 · 배당 {api ? '자동(The Odds API)' : '수동 입력'} ·
        출처 {source}
      </p>
      <FixturesView matches={matches} oddsByMatch={oddsByMatch} />
    </>
  );
}
