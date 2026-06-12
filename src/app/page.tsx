import { getMatches } from '@/lib/data-sources';
import { listBets, summarize } from '@/lib/bets/store';
import { MatchList } from '@/components/MatchList';

export const dynamic = 'force-dynamic';

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

export default async function DashboardPage() {
  const [{ matches, source }, bets] = await Promise.all([
    getMatches(),
    listBets(),
  ]);
  const stats = summarize(bets);

  const live = matches.filter(
    (m) => m.status === 'LIVE' || m.status === 'PAUSED',
  );
  const upcoming = matches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 5);

  return (
    <>
      <h1>대시보드</h1>
      <p className="muted">
        경기 데이터 출처: <strong>{source}</strong> · 모임 자금 현황 요약
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card">
          <div className="muted">총 베팅액</div>
          <div className="stat">{won(stats.totalStake)}</div>
        </div>
        <div className="card">
          <div className="muted">손익</div>
          <div
            className="stat"
            style={{ color: stats.profit >= 0 ? 'var(--accent)' : 'var(--live)' }}
          >
            {stats.profit >= 0 ? '+' : ''}
            {won(stats.profit)}
          </div>
        </div>
        <div className="card">
          <div className="muted">적중률</div>
          <div className="stat">{(stats.winRate * 100).toFixed(0)}%</div>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>🔴 진행중 경기</h2>
      <MatchList matches={live} />

      <h2 style={{ marginTop: 32 }}>다가오는 경기</h2>
      <MatchList matches={upcoming} />
    </>
  );
}
