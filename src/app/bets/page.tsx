import { listBetsSettled, summarize } from '@/lib/bets/store';
import { getMatches } from '@/lib/data-sources';
import { DeleteBet } from '@/components/DeleteBet';
import { AutoRefresh } from '@/components/AutoRefresh';
import { toKoreanTeam } from '@/lib/teams/korea';
import type { Match, Outcome } from '@/lib/types';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  PENDING: '대기',
  WON: '적중',
  LOST: '미적중',
  VOID: '무효',
};

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

// 베팅 등록 시각(createdAt) — 한국시간 컴팩트.
function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
// 경기 일자/시간 — 한국시간.
function fmtMatch(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function pickText(pick: Outcome, home: string, away: string): string {
  if (pick === 'HOME') return `${home} 승`;
  if (pick === 'AWAY') return `${away} 승`;
  return '무승부';
}

function scoreOutcome(s: { home: number; away: number }): Outcome {
  if (s.home > s.away) return 'HOME';
  if (s.home < s.away) return 'AWAY';
  return 'DRAW';
}

const ACCENT = 'var(--accent)';
const RED = 'var(--live)';

export default async function BetsPage() {
  const { matches } = await getMatches();
  // 종료된 경기의 PENDING 베팅은 결과대로 자동 정산.
  const bets = await listBetsSettled(matches);
  const stats = summarize(bets);

  const matchById = new Map<string, Match>(matches.map((m) => [m.id, m]));

  // 베팅 한 건의 표시용 상태/수령(경기 진행상황 반영) 계산.
  function rowView(b: (typeof bets)[number]) {
    const m = matchById.get(b.matchId);
    const live = m?.status === 'LIVE' || m?.status === 'PAUSED';
    const finished = m?.status === 'FINISHED';
    const expected = Math.round(b.stake * b.oddsAtPlacement);

    if (live && m?.score) {
      const hit = scoreOutcome(m.score) === b.pick;
      return {
        status: `경기중 ${m.score.home}:${m.score.away} · ${hit ? '적중 예상' : '미적중 예상'}`,
        color: hit ? ACCENT : RED,
        payout: hit ? `(예상) ${won(expected)}` : '-',
      };
    }
    if (live) return { status: '경기중', color: undefined, payout: '-' };
    if (finished || b.status === 'WON' || b.status === 'LOST' || b.status === 'VOID') {
      const color =
        b.status === 'WON' ? ACCENT : b.status === 'LOST' ? RED : undefined;
      return {
        status: statusLabel[b.status] ?? b.status,
        color,
        payout: b.payout != null ? won(b.payout) : '-',
      };
    }
    // 아직 시작 전
    return { status: '경기전', color: undefined, payout: '-' };
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
        <h1 style={{ marginBottom: 4 }}>베팅내역</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        총 {stats.count}건 · 베팅액 {won(stats.totalStake)} · 수령{' '}
        {won(stats.totalPayout)} · 손익{' '}
        <strong style={{ color: stats.profit >= 0 ? 'var(--accent)' : 'var(--live)' }}>
          {stats.profit >= 0 ? '+' : ''}
          {won(stats.profit)}
        </strong>
      </p>

      {bets.length === 0 ? (
        <p className="muted">아직 등록된 베팅이 없습니다.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>베팅일시</th>
                <th>경기 (일시)</th>
                <th>선택</th>
                <th>배당</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => {
                const m = matchById.get(b.matchId);
                const homeKor = m ? toKoreanTeam(m.home.name) : '';
                const awayKor = m ? toKoreanTeam(m.away.name) : '';
                const label = m ? `${homeKor} vs ${awayKor}` : b.matchId;
                const v = rowView(b);
                return (
                  <tr key={b.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtWhen(b.createdAt)}
                    </td>
                    <td>
                      {label}
                      {m && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {fmtMatch(m.kickoff)}
                        </div>
                      )}
                    </td>
                    <td>{m ? pickText(b.pick, homeKor, awayKor) : b.pick}</td>
                    <td>{b.oddsAtPlacement.toFixed(2)}</td>
                    <td>{won(b.stake)}</td>
                    <td style={{ color: v.color, whiteSpace: 'nowrap' }}>
                      {v.status}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{v.payout}</td>
                    <td>
                      <DeleteBet id={b.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
