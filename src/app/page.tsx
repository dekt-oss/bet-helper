import Link from 'next/link';
import { getMatches, getOdds, resolveMatchIds } from '@/lib/data-sources';
import { listBetsSettled } from '@/lib/bets/store';
import { listOpinions } from '@/lib/opinions/store';
import { computePredictionLeaderboard } from '@/lib/opinions/leaderboard';
import { computePoolBalance } from '@/lib/pool/balance';
import { OPINION_MEMBERS } from '@/lib/pool/config';
import { MatchList, type OddsTriple } from '@/components/MatchList';
import { AutoRefresh } from '@/components/AutoRefresh';
import { OddsHealthBanner } from '@/components/OddsHealthBanner';
import { getBetmanHeartbeat } from '@/lib/odds/status';
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
  const [{ matches, source }, { odds }, heartbeat, opinions] = await Promise.all([
    getMatches(),
    getOdds(),
    getBetmanHeartbeat(),
    listOpinions(),
  ]);
  const bets = await listBetsSettled(matches);
  const pool = computePoolBalance(bets);

  // 예측왕 Top 3 (베팅과 무관한 의견 적중률). 옛 ID 의견도 복구해 집계.
  const predTop = computePredictionLeaderboard(
    resolveMatchIds(opinions, matches),
    matches,
    OPINION_MEMBERS,
  )
    .filter((r) => r.attempts > 0)
    .slice(0, 3);

  const oddsByMatch: Record<string, OddsTriple> = {};
  for (const o of odds)
    oddsByMatch[o.matchId] = { home: o.home, draw: o.draw, away: o.away };

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

      <OddsHealthBanner odds={odds} matches={matches} heartbeat={heartbeat} />

      <div className="stat-grid">
        <div className="card primary">
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

      {predTop.length > 0 && (
        <>
          <div className="section-head">
            <h2>🏆 예측왕 Top 3</h2>
            <Link href="/ranking">전체 순위 →</Link>
          </div>
          <div className="card mini-rank">
            {predTop.map((r, i) => (
              <div className="mini-rank-row" key={r.member}>
                <span className="mini-rank-pos">
                  {['🥇', '🥈', '🥉'][i]}
                </span>
                <span className="mini-rank-name">
                  {r.member}
                  {r.streak >= 2 && (
                    <span className="streak-badge">🔥 {r.streak}</span>
                  )}
                </span>
                <span className="mini-rank-pct">
                  {Math.round(r.winRate * 100)}%
                  <span className="muted" style={{ fontSize: 12 }}>
                    {' '}
                    ({r.correct}/{r.attempts})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 베팅내역 (최근) */}
      <div className="section-head">
        <h2>📋 최근 베팅내역</h2>
        <Link href="/bets">전체 보기 →</Link>
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
                <th>배당</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
              </tr>
            </thead>
            <tbody>
              {recentBets.map((b) => (
                <tr key={b.id}>
                  <td data-label="경기" className="cell-stack">
                    {matchKorName.get(b.matchId) ?? b.matchId}
                  </td>
                  <td data-label="선택">{pickLabel[b.pick] ?? b.pick}</td>
                  <td data-label="배당">{b.oddsAtPlacement.toFixed(2)}</td>
                  <td data-label="금액">{won(b.stake)}</td>
                  <td data-label="상태">{statusLabel[b.status] ?? b.status}</td>
                  <td data-label="수령">{b.payout != null ? won(b.payout) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {live.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🔴 진행중 경기</h2>
          <MatchList matches={live} oddsByMatch={oddsByMatch} />
        </>
      )}

      {koreaUpcoming.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🇰🇷 한국 경기</h2>
          <MatchList matches={koreaUpcoming} oddsByMatch={oddsByMatch} />
        </>
      )}

      <h2 style={{ marginTop: 32 }}>다가오는 경기</h2>
      <MatchList matches={upcoming} oddsByMatch={oddsByMatch} />
    </>
  );
}
