import { getMatches } from '@/lib/data-sources';
import { listBets } from '@/lib/bets/store';
import { computePoolBalance } from '@/lib/pool/balance';
import { MatchList } from '@/components/MatchList';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

export default async function DashboardPage() {
  const [{ matches, source }, bets] = await Promise.all([
    getMatches(),
    listBets(),
  ]);
  const pool = computePoolBalance(bets);

  const live = matches.filter(
    (m) => m.status === 'LIVE' || m.status === 'PAUSED',
  );
  const upcoming = matches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 5);

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
        <h1 style={{ marginBottom: 4 }}>대시보드</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        경기 데이터 출처: <strong>{source}</strong> · 공동자금 현황
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card">
          <div className="muted">현재 잔액</div>
          <div className="stat">{won(pool.balance)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            초기 {won(pool.initial)}
          </div>
        </div>
        <div className="card">
          <div className="muted">손익</div>
          <div
            className="stat"
            style={{ color: pool.profit >= 0 ? 'var(--accent)' : 'var(--live)' }}
          >
            {pool.profit >= 0 ? '+' : ''}
            {won(pool.profit)}
          </div>
        </div>
        <div className="card">
          <div className="muted">적중률</div>
          <div className="stat">{(pool.winRate * 100).toFixed(0)}%</div>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>🔴 진행중 경기</h2>
      <MatchList matches={live} />

      <h2 style={{ marginTop: 32 }}>다가오는 경기</h2>
      <MatchList matches={upcoming} />
    </>
  );
}
