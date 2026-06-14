import { getMatches } from '@/lib/data-sources';
import { listOpinions } from '@/lib/opinions/store';
import {
  computePredictionLeaderboard,
  resultOf,
} from '@/lib/opinions/leaderboard';
import { OPINION_MEMBERS, MEMBERS, ADVISORY_MEMBERS } from '@/lib/pool/config';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

const medal = ['🥇', '🥈', '🥉'];

export default async function RankingPage() {
  const [{ matches }, opinions] = await Promise.all([
    getMatches(),
    listOpinions(),
  ]);

  const rows = computePredictionLeaderboard(
    opinions,
    matches,
    OPINION_MEMBERS,
    ADVISORY_MEMBERS,
  );

  // 채점된(종료+스코어) 경기 수 — 모수 안내용.
  const gradedCount = matches.filter(
    (m) => m.status === 'FINISHED' && resultOf(m) != null,
  ).length;

  const hasAnyRecord = rows.some((r) => r.attempts > 0);

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
        <h1 style={{ marginBottom: 4 }}>🏆 예측 순위</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        베팅(돈)과 무관하게, 각자 낸 경기 의견(승/무/패)이 실제 결과와 맞은
        비율로 겨루는 <strong>예측왕 대결</strong>입니다. · 채점된 경기{' '}
        {gradedCount}개
      </p>

      {!hasAnyRecord ? (
        <p className="muted" style={{ marginTop: 20 }}>
          아직 채점할 기록이 없습니다. 경기가 종료되면 입력한 의견의 적중률이
          집계됩니다.
        </p>
      ) : (
        <div className="card table-wrap" style={{ marginTop: 16 }}>
          <table className="rank-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>순위</th>
                <th>이름</th>
                <th style={{ textAlign: 'right' }}>적중/시도</th>
                <th style={{ width: '38%' }}>적중률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ranked = r.attempts > 0;
                const pct = Math.round(r.winRate * 100);
                return (
                  <tr key={r.member} className={ranked && i < 3 ? 'top' : ''}>
                    <td className="rank-pos">
                      {ranked ? (medal[i] ?? `${i + 1}`) : '—'}
                    </td>
                    <td>
                      <strong>{r.member}</strong>
                      {r.advisory && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {' '}
                          (참고)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {ranked ? (
                        <>
                          <b>{r.correct}</b>
                          <span className="muted"> / {r.attempts}</span>
                        </>
                      ) : (
                        <span className="muted">기록 없음</span>
                      )}
                    </td>
                    <td>
                      {ranked ? (
                        <div className="rank-bar-row">
                          <div className="rank-bar">
                            <div
                              className="rank-bar-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="rank-pct">{pct}%</span>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        ※ 합의 대상 3인({MEMBERS.join(' · ')})과 참고인이 모두 집계됩니다. 종료된
        경기에 입력한 의견만 채점합니다.
      </p>
    </>
  );
}
