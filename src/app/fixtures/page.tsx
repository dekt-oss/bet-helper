import { getMatches } from '@/lib/data-sources';
import { MatchList } from '@/components/MatchList';

export const dynamic = 'force-dynamic';

export default async function FixturesPage() {
  const { matches, source } = await getMatches();
  const sorted = [...matches].sort((a, b) =>
    a.kickoff.localeCompare(b.kickoff),
  );

  return (
    <>
      <h1>경기일정</h1>
      <p className="muted">
        총 {matches.length}경기 · 출처 {source}
      </p>
      <MatchList matches={sorted} />
    </>
  );
}
