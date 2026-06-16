import { listSlipsUnified } from '@/lib/bets/slip-store';
import { getMatches } from '@/lib/data-sources';
import { computePoolBalance, computePerPerson } from '@/lib/pool/balance';
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
  const { matches } = await getMatches();
  const slips = await listSlipsUnified(matches);
  const pool = computePoolBalance(slips);
  const per = computePerPerson(pool);
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
      <div className="stat-grid">
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

      <div className="stat-grid" style={{ marginTop: 12 }}>
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

      {/* 개인당(균등 분배) */}
      <h2 style={{ marginTop: 32 }}>개인당 ({per.count}명 균등)</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        손익·잔액을 인원수로 똑같이 나눈 1인 기준 금액입니다.
      </p>
      <div className="stat-grid">
        <div className="card">
          <div className="muted">개인당 예상 손익</div>
          <div className="stat" style={{ color: profitColor }}>
            {signed(per.profit)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            개인 출자 {won(per.contribution)}
          </div>
        </div>
        <div className="card">
          <div className="muted">개인당 현재 잔액</div>
          <div className="stat">{won(per.balance)}</div>
        </div>
      </div>
    </>
  );
}
