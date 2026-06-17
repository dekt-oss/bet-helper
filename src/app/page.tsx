import Link from 'next/link';
import { getMatches, getOdds } from '@/lib/data-sources';
import { listSlipsUnified } from '@/lib/bets/slip-store';
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

const pickLabel: Record<string, string> = {
  HOME: '승',
  DRAW: '무',
  AWAY: '패',
  OVER: '오버',
  UNDER: '언더',
};
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
  const slips = await listSlipsUnified(matches);
  const pool = computePoolBalance(slips);

  // 예측왕 Top 3 (베팅과 무관한 의견 적중률). 의견은 옛 데이터 복구 없이 현재 것만.
  const predTop = computePredictionLeaderboard(opinions, matches, OPINION_MEMBERS)
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
  // 우리가 베팅한 경기 id 집합(전표 폴 기준) — 다가오는 경기에서 최우선 노출 + 배지 표시.
  const bettedMatchIds = new Set(
    slips.flatMap((s) => s.legs.map((l) => l.matchId)),
  );
  const bettedIds = [...bettedMatchIds];

  // 한국 경기를 최우선으로, 나머지는 다가오는 경기로.
  const scheduled = matches.filter((m) => m.status === 'SCHEDULED');
  const koreaUpcoming = sortKoreaFirst(scheduled.filter(isKoreaMatch)).slice(0, 5);
  // 다가오는 경기: 베팅한 경기를 먼저, 그다음 킥오프 순.
  const upcoming = scheduled
    .filter((m) => !isKoreaMatch(m))
    .sort((a, b) => {
      const ba = bettedMatchIds.has(a.id) ? 0 : 1;
      const bb = bettedMatchIds.has(b.id) ? 0 : 1;
      return ba - bb || a.kickoff.localeCompare(b.kickoff);
    })
    .slice(0, 5);
  const recentBets = slips.slice(0, 5);

  // 전표 구성 요약(단폴: 경기+선택, 다폴: "N폴 조합").
  function slipSummary(s: (typeof slips)[number]): string {
    if (s.legs.length >= 2) return `${s.legs.length}폴 조합`;
    const leg = s.legs[0];
    if (!leg) return '-';
    return matchKorName.get(leg.matchId) ?? leg.matchId;
  }
  function slipPick(s: (typeof slips)[number]): string {
    if (s.legs.length >= 2) return '조합';
    const leg = s.legs[0];
    if (!leg) return '-';
    const label = pickLabel[leg.pick] ?? leg.pick;
    return leg.line != null ? `${label} ${leg.line}` : label;
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
              {recentBets.map((s) => (
                <tr key={s.id}>
                  <td data-label="경기" className="cell-stack">
                    {slipSummary(s)}
                  </td>
                  <td data-label="선택">{slipPick(s)}</td>
                  <td data-label="배당">{s.combinedOdds.toFixed(2)}</td>
                  <td data-label="금액">{won(s.stake)}</td>
                  <td data-label="상태">{statusLabel[s.status] ?? s.status}</td>
                  <td data-label="수령">{s.payout != null ? won(s.payout) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {live.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🔴 진행중 경기</h2>
          <MatchList matches={live} oddsByMatch={oddsByMatch} bettedIds={bettedIds} />
        </>
      )}

      {koreaUpcoming.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>🇰🇷 한국 경기</h2>
          <MatchList matches={koreaUpcoming} oddsByMatch={oddsByMatch} bettedIds={bettedIds} />
        </>
      )}

      <h2 style={{ marginTop: 32 }}>다가오는 경기</h2>
      <MatchList matches={upcoming} oddsByMatch={oddsByMatch} bettedIds={bettedIds} />
    </>
  );
}
