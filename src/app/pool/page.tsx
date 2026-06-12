import { listBets } from '@/lib/bets/store';
import {
  computePoolBalance,
  computeMemberShares,
} from '@/lib/pool/balance';
import { POOL } from '@/lib/pool/config';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}${POOL.currency}`;
}

function signed(n: number) {
  return `${n >= 0 ? '+' : ''}${won(n)}`;
}

export default async function PoolPage() {
  const bets = await listBets();
  const pool = computePoolBalance(bets);
  const shares = computeMemberShares(pool.profit);
  const profitColor = pool.profit >= 0 ? 'var(--accent)' : 'var(--live)';

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
        <h1 style={{ marginBottom: 4 }}>정산 · 잔액</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        공동자금 {POOL.members.length}명 · 1판 기본 {won(POOL.defaultStake)} 베팅
      </p>

      {/* 핵심 지표 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="card">
          <div className="muted">현재 잔액</div>
          <div className="stat">{won(pool.balance)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            초기 {won(pool.initial)}
            {pool.locked > 0 ? ` · 대기중 ${won(pool.locked)} 잠김` : ''}
          </div>
        </div>
        <div className="card">
          <div className="muted">손익 (수익률)</div>
          <div className="stat" style={{ color: profitColor }}>
            {signed(pool.profit)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            ROI {(pool.roi * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}
      >
        <div className="card">
          <div className="muted">누적 베팅액</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{won(pool.staked)}</div>
        </div>
        <div className="card">
          <div className="muted">누적 수령액</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {won(pool.returned)}
          </div>
        </div>
        <div className="card">
          <div className="muted">적중률</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {(pool.winRate * 100).toFixed(0)}%
            <span className="muted" style={{ fontSize: 12 }}>
              {' '}
              ({pool.settledCount}건 정산)
            </span>
          </div>
        </div>
      </div>

      {/* 멤버별 지분 */}
      <h2 style={{ marginTop: 32 }}>멤버별 정산</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        손익을 출자 비율대로 나눈 현재 지분 가치입니다.
      </p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>멤버</th>
              <th>출자액</th>
              <th>손익 몫</th>
              <th>현재 지분</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{won(s.contribution)}</td>
                <td style={{ color: s.profitShare >= 0 ? 'var(--accent)' : 'var(--live)' }}>
                  {signed(s.profitShare)}
                </td>
                <td>
                  <strong>{won(s.equity)}</strong>
                </td>
              </tr>
            ))}
            <tr>
              <td className="muted">합계</td>
              <td className="muted">{won(pool.initial)}</td>
              <td className="muted" style={{ color: profitColor }}>
                {signed(pool.profit)}
              </td>
              <td className="muted">
                <strong>{won(pool.balance)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
