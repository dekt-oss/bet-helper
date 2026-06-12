import Link from 'next/link';
import { getMatches } from '@/lib/data-sources';
import { listBets } from '@/lib/bets/store';
import { computePoolBalance } from '@/lib/pool/balance';
import { MatchList } from '@/components/MatchList';
import { AutoRefresh } from '@/components/AutoRefresh';
import { sortKoreaFirst, isKoreaMatch, toKoreanTeam } from '@/lib/teams/korea';

export const dynamic = 'force-dynamic';

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

const pickLabel: Record<string, string> = { HOME: '승', DRAW: '무', AWAY: '패' };
const statusLabel: Record<string, string> = {
  PENDING: '대기',
  WON: '적중',
  LOST: '미적중',
  VOID: '무효',
};

export default async function DashboardPage() {
  const [{ matches, source }, bets] = await Promise.all([
    getMatches(),
    listBets(),
  ]);
  const pool = computePoolBalance(bets);

  const matchKorName = new Map(
    matches.map((m) => [
      m.id,
      `${toKoreanTeam(m.home.name)} vs ${toKoreanTeam(m.away.name)}`,
    ]),
  );

  const live = sortKoreaFirst(
    matches.filter((m) => m.status === 'LIVE' || m.status === 'PAUSED'),
  );
  // 한국 경기를 최우선으로, 나머지는 다가오는 경기로.
  const scheduled = matches.filter((m) => m.status === 'SCHEDULED');
  const koreaUpcoming = sortKoreaFirst(scheduled.filter(isKoreaMatch)).slice(0, 5);
  const upcoming = scheduled
    .filter((m) => !isKoreaMatch(m))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 5);
  const recentBets = bets.slice(0, 5);

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

      {/* 베팅내역 (최근) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: 32,
        }}
      >
        <h2 style={{ margin: 0 }}>📋 최근 베팅내역</h2>
        <Link href="/bets" className="muted" style={{ fontSize: 13 }}>
          전체 보기 →
        </Link>
      </div>
      {recentBets.length === 0 ? (
        <p className="muted">아직 베팅내역이 없습니다.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>경기</th>
                <th>선택</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
              </tr>
            </thead>
            <tbody>
              {recentBets.map((b) => (
                <tr key={b.id}>
                  <td>{matchKorName.get(b.matchId) ?? b.matchId}</td>
                  <td>{pickLabel[b.pick] ?? b.pick}</td>
                  <td>{won(b.stake)}</td>
                  <td>{statusLabel[b.status] ?? b.status}</td>
                  <td>{b.payout != null ? won(b.payout) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {live.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🔴 진행중 경기</h2>
          <MatchList matches={live} />
        </>
      )}

      {koreaUpcoming.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🇰🇷 한국 경기</h2>
          <MatchList matches={koreaUpcoming} />
        </>
      )}

      <h2 style={{ marginTop: 32 }}>다가오는 경기</h2>
      <MatchList matches={upcoming} />
    </>
  );
}
