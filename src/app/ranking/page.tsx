import { getMatches } from '@/lib/data-sources';
import { listOpinions } from '@/lib/opinions/store';
import {
  computePredictionLeaderboard,
  computePredictionDetails,
} from '@/lib/opinions/leaderboard';
import { OPINION_MEMBERS, MEMBERS } from '@/lib/pool/config';
import { AutoRefresh } from '@/components/AutoRefresh';
import { PredictionDetails } from '@/components/PredictionDetails';

export const dynamic = 'force-dynamic';

const medal = ['🥇', '🥈', '🥉'];

export default async function RankingPage() {
  const [{ matches }, opinions] = await Promise.all([
    getMatches(),
    listOpinions(),
  ]);
  // 의견은 옛(오염된) 데이터를 복구하지 않는다 — 깨끗한 상태에서 새로 시작.

  const rows = computePredictionLeaderboard(opinions, matches, OPINION_MEMBERS);
  const details = computePredictionDetails(
    opinions,
    matches,
    OPINION_MEMBERS,
    [],
    MEMBERS,
  );

  const hasAnyRecord = rows.some((r) => r.attempts > 0);
  const leader = hasAnyRecord ? rows[0] : null;

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
        비율로 겨루는 <strong>예측왕 대결</strong>입니다.
      </p>

      {/* 요약 지표 */}
      <div className="stat-grid" style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="card primary">
          <div className="muted">현재 선두</div>
          <div className="stat">
            {leader ? `${medal[0]} ${leader.member}` : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {leader
              ? `적중률 ${Math.round(leader.winRate * 100)}% · ${leader.correct}/${leader.attempts}`
              : '기록 없음'}
          </div>
        </div>
        <div className="card">
          <div className="muted">참여자</div>
          <div className="stat">{OPINION_MEMBERS.length}명</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {OPINION_MEMBERS.join(' · ')}
          </div>
        </div>
      </div>

      {/* 순위표 (조별리그 순위표 형식) */}
      <div className="card standings-card" style={{ marginTop: 8 }}>
        <table className="standings-table rank-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>플레이어</th>
              <th title="예측한 채점 경기수" style={{ textAlign: 'center' }}>
                참여
              </th>
              <th title="적중 수" style={{ textAlign: 'center' }}>
                적중
              </th>
              <th title="최근 5경기(최신이 오른쪽)" style={{ textAlign: 'center' }}>
                최근
              </th>
              <th style={{ width: '32%' }}>적중률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ranked = r.attempts > 0;
              const pct = Math.round(r.winRate * 100);
              const tied =
                r.rank != null &&
                rows.filter((x) => x.rank === r.rank).length > 1;
              return (
                <tr
                  key={r.member}
                  className={r.rank != null && r.rank <= 3 ? 'qualify' : ''}
                >
                  <td className="muted rank-pos">
                    {r.rank != null
                      ? `${tied ? '=' : ''}${r.rank}`
                      : '—'}
                  </td>
                  <td className="team">
                    {r.member}
                    {r.rank != null && r.rank <= 3 ? ` ${medal[r.rank - 1]}` : ''}
                    {r.streak >= 2 && (
                      <span className="streak-badge">🔥 {r.streak}연속</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.attempts}</td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>{r.correct}</strong>
                  </td>
                  <td>
                    {ranked ? (
                      <div className="form-dots">
                        {r.form.map((ok, i) => (
                          <span
                            key={i}
                            className={`form-dot ${ok ? 'ok' : 'no'}`}
                            title={ok ? '적중' : '빗나감'}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="muted">—</span>
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
                      <span className="muted">기록 없음</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 경기별 예측 상세 (필터 가능) */}
      {details.length > 0 && (
        <>
          <h2>경기별 예측</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
            누가 무엇을 예상했는지와 실제 결과입니다. (✅ 적중 · ❌ 빗나감 · 결과
            전 경기는 표시 없음)
          </p>
          <PredictionDetails details={details} />
        </>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        ※ 종료된 경기에 입력한 의견(승/무/패)만 채점합니다. 무승부 예측도 동일하게
        집계됩니다.
      </p>
    </>
  );
}
