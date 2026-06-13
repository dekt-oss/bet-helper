import { listBetsSettled, summarize } from '@/lib/bets/store';
import { getMatches, getOdds } from '@/lib/data-sources';
import { BetForm, type OddsTriple } from '@/components/BetForm';
import { DeleteBet } from '@/components/DeleteBet';
import { AutoRefresh } from '@/components/AutoRefresh';
import { buildMatchOptions } from '@/lib/teams/options';
import { toKoreanTeam } from '@/lib/teams/korea';

export const dynamic = 'force-dynamic';

const pickLabel: Record<string, string> = {
  HOME: '승',
  DRAW: '무',
  AWAY: '패',
};

const statusLabel: Record<string, string> = {
  PENDING: '대기',
  WON: '적중',
  LOST: '미적중',
  VOID: '무효',
};

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

// 일시 = 베팅 등록 시각(createdAt)을 한국시간으로 컴팩트하게.
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

export default async function BetsPage({
  searchParams,
}: {
  searchParams?: { match?: string };
}) {
  const [{ matches }, { odds }] = await Promise.all([getMatches(), getOdds()]);
  // 종료된 경기의 PENDING 베팅은 결과대로 자동 정산.
  const bets = await listBetsSettled(matches);
  const initialMatchId = searchParams?.match;
  const stats = summarize(bets);

  // 폼에 넘길 경기 옵션(한국 우선 + 날짜 + 한글)
  const matchOptions = buildMatchOptions(matches);

  // 배당 자동 채움용 맵(베트맨 배당)
  const oddsByMatch: Record<string, OddsTriple> = {};
  for (const o of odds) {
    oddsByMatch[o.matchId] = { home: o.home, draw: o.draw, away: o.away };
  }

  // 경기 id → 한글 표시명 (베팅내역 테이블에서 matchId 대신 팀명 표시)
  const matchName = new Map(
    matches.map((m) => [
      m.id,
      `${toKoreanTeam(m.home.name)} vs ${toKoreanTeam(m.away.name)}`,
    ]),
  );

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

      <BetForm
        matches={matchOptions}
        oddsByMatch={oddsByMatch}
        initialMatchId={initialMatchId}
      />

      {bets.length === 0 ? (
        <p className="muted">아직 등록된 베팅이 없습니다. 위 폼으로 추가하세요.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>일시</th>
                <th>경기</th>
                <th>선택</th>
                <th>배당</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {fmtWhen(b.createdAt)}
                  </td>
                  <td>{matchName.get(b.matchId) ?? b.matchId}</td>
                  <td>{pickLabel[b.pick] ?? b.pick}</td>
                  <td>{b.oddsAtPlacement.toFixed(2)}</td>
                  <td>{won(b.stake)}</td>
                  <td>{statusLabel[b.status] ?? b.status}</td>
                  <td>{b.payout != null ? won(b.payout) : '-'}</td>
                  <td>
                    <DeleteBet id={b.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
