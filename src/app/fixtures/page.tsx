import { getMatches } from '@/lib/data-sources';
import { MatchList } from '@/components/MatchList';
import { AutoRefresh } from '@/components/AutoRefresh';
import { sortKoreaFirst } from '@/lib/teams/korea';

export const dynamic = 'force-dynamic';

export default async function FixturesPage() {
  const { matches, source } = await getMatches();
  // 한국 경기 최우선, 그다음 시간순.
  const sorted = sortKoreaFirst(matches);

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
        총 {matches.length}경기 · 한국 경기 우선 표시 · 출처 {source}
      </p>
      <MatchList matches={sorted} />
    </>
  );
}
