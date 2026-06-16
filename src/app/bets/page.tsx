import { listSlipsUnified, summarizeSlips } from '@/lib/bets/slip-store';
import { getMatches } from '@/lib/data-sources';
import { DeleteSlip } from '@/components/DeleteSlip';
import { AutoRefresh } from '@/components/AutoRefresh';
import { toKoreanTeam } from '@/lib/teams/korea';
import type { BetLeg, Match } from '@/lib/types';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  PENDING: '대기',
  WON: '적중',
  LOST: '미적중',
  VOID: '무효',
};
const marketLabel: Record<string, string> = {
  '1X2': '승무패',
  HANDICAP: '핸디캡',
  OU: '언더오버',
};

const ACCENT = 'var(--accent)';
const RED = 'var(--live)';

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

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

function statusColor(status: string): string | undefined {
  if (status === 'WON') return ACCENT;
  if (status === 'LOST') return RED;
  return undefined;
}

function fmtLine(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export default async function BetsPage() {
  const { matches } = await getMatches();
  const slips = await listSlipsUnified(matches);
  const stats = summarizeSlips(slips);
  const matchById = new Map<string, Match>(matches.map((m) => [m.id, m]));

  function teamsOf(matchId: string): { home: string; away: string; label: string } {
    const m = matchById.get(matchId);
    if (!m) return { home: '', away: '', label: matchId };
    const home = toKoreanTeam(m.home.name);
    const away = toKoreanTeam(m.away.name);
    return { home, away, label: `${home} vs ${away}` };
  }

  // 폴 한 줄의 선택 표시(경기 · 마켓 · 선택).
  function legText(leg: BetLeg): { match: string; pick: string } {
    const { home, away, label } = teamsOf(leg.matchId);
    let pick: string;
    if (leg.market === 'OU') {
      pick = `${leg.pick === 'OVER' ? '오버' : '언더'} ${leg.line ?? ''}`.trim();
    } else {
      const base =
        leg.pick === 'HOME' ? `${home} 승` : leg.pick === 'AWAY' ? `${away} 승` : '무승부';
      pick =
        leg.market === 'HANDICAP' && leg.line != null
          ? `${base} (${fmtLine(leg.line)})`
          : base;
    }
    return { match: label, pick: `[${marketLabel[leg.market] ?? leg.market}] ${pick}` };
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
        <strong style={{ color: stats.profit >= 0 ? ACCENT : RED }}>
          {stats.profit >= 0 ? '+' : ''}
          {won(stats.profit)}
        </strong>
      </p>

      {slips.length === 0 ? (
        <p className="muted">아직 등록된 베팅이 없습니다.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>베팅일시</th>
                <th>구성</th>
                <th>총배당</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => {
                const multi = s.legs.length >= 2;
                const first = s.legs[0] ? legText(s.legs[0]) : { match: '', pick: '' };
                return (
                  <tr key={s.id}>
                    <td data-label="베팅일시" className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtWhen(s.createdAt)}
                    </td>
                    <td data-label="구성" className="cell-stack">
                      {multi ? (
                        <details>
                          <summary>
                            <b>{s.legs.length}폴 조합</b>{' '}
                            <span className="muted" style={{ fontSize: 12 }}>
                              (펼치기)
                            </span>
                          </summary>
                          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                            {s.legs.map((leg, i) => {
                              const lt = legText(leg);
                              return (
                                <div key={i} style={{ fontSize: 12.5 }}>
                                  <span>{lt.match}</span>{' '}
                                  <span className="muted">· {lt.pick}</span>{' '}
                                  <b>{leg.oddsAtPlacement.toFixed(2)}</b>{' '}
                                  <span style={{ color: statusColor(leg.status) }}>
                                    {statusLabel[leg.status] ?? leg.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ) : (
                        <>
                          {first.match}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {first.pick}
                          </div>
                        </>
                      )}
                    </td>
                    <td data-label="총배당">{s.combinedOdds.toFixed(2)}</td>
                    <td data-label="금액">{won(s.stake)}</td>
                    <td data-label="상태" style={{ color: statusColor(s.status), whiteSpace: 'nowrap' }}>
                      {statusLabel[s.status] ?? s.status}
                    </td>
                    <td data-label="수령" style={{ whiteSpace: 'nowrap' }}>
                      {s.payout != null ? won(s.payout) : '-'}
                    </td>
                    <td data-label="">
                      <DeleteSlip id={s.id} legacyBetId={s.legacyBetId} />
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
