import { listBets, summarize } from '@/lib/bets/store';

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

export default async function BetsPage() {
  const bets = await listBets();
  const stats = summarize(bets);

  return (
    <>
      <h1>베팅내역</h1>
      <p className="muted">
        총 {stats.count}건 · 베팅액 {won(stats.totalStake)} · 수령{' '}
        {won(stats.totalPayout)} · 손익{' '}
        <strong style={{ color: stats.profit >= 0 ? 'var(--accent)' : 'var(--live)' }}>
          {stats.profit >= 0 ? '+' : ''}
          {won(stats.profit)}
        </strong>
      </p>

      {bets.length === 0 ? (
        <div className="card">
          <p className="muted">아직 등록된 베팅이 없습니다.</p>
          <p className="muted" style={{ fontSize: 13 }}>
            POST <code>/api/bets</code> 로 추가할 수 있습니다. 예:
          </p>
          <pre className="muted" style={{ fontSize: 12, overflowX: 'auto' }}>
{`curl -X POST localhost:3000/api/bets \\
  -H 'content-type: application/json' \\
  -d '{"matchId":"wc2026-1","placedBy":"철수",
       "pick":"HOME","oddsAtPlacement":2.1,"stake":10000}'`}
          </pre>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>일시</th>
                <th>경기</th>
                <th>건 사람</th>
                <th>선택</th>
                <th>배당</th>
                <th>금액</th>
                <th>상태</th>
                <th>수령</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id}>
                  <td className="muted">
                    {new Date(b.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td>{b.matchId}</td>
                  <td>{b.placedBy}</td>
                  <td>{pickLabel[b.pick] ?? b.pick}</td>
                  <td>{b.oddsAtPlacement.toFixed(2)}</td>
                  <td>{won(b.stake)}</td>
                  <td>{statusLabel[b.status] ?? b.status}</td>
                  <td>{b.payout != null ? won(b.payout) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
