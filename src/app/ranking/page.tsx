import { getMatches } from '@/lib/data-sources';
import { listOpinions, groupByMatch } from '@/lib/opinions/store';
import {
  computePredictionLeaderboard,
  computePredictionDetails,
  resultOf,
} from '@/lib/opinions/leaderboard';
import { consensus } from '@/lib/opinions/consensus';
import { OPINION_MEMBERS, MEMBERS } from '@/lib/pool/config';
import { toKoreanTeam } from '@/lib/teams/korea';
import { AutoRefresh } from '@/components/AutoRefresh';
import type { Outcome } from '@/lib/types';

export const dynamic = 'force-dynamic';

const medal = ['🥇', '🥈', '🥉'];
const pickLabel: Record<Outcome, string> = { HOME: '승', DRAW: '무', AWAY: '패' };
const statusText: Record<string, string> = {
  SCHEDULED: '예정',
  LIVE: '진행중',
  PAUSED: '하프타임',
  FINISHED: '종료',
  POSTPONED: '연기',
  CANCELLED: '취소',
};

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

export default async function RankingPage() {
  const [{ matches }, opinions] = await Promise.all([
    getMatches(),
    listOpinions(),
  ]);

  const rows = computePredictionLeaderboard(opinions, matches, OPINION_MEMBERS);
  const details = computePredictionDetails(opinions, matches, OPINION_MEMBERS);
  const opinionsByMatch = groupByMatch(opinions);

  // 채점된(종료+스코어) 경기 수 — 모수 안내용.
  const gradedCount = matches.filter(
    (m) => m.status === 'FINISHED' && resultOf(m) != null,
  ).length;

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
          <div className="muted">채점된 경기</div>
          <div className="stat">{gradedCount}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            종료·결과 확정 경기
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
              <th style={{ width: 28 }}>#</th>
              <th>플레이어</th>
              <th title="예측한 채점 경기수" style={{ textAlign: 'center' }}>
                참여
              </th>
              <th title="적중 수" style={{ textAlign: 'center' }}>
                적중
              </th>
              <th style={{ width: '40%' }}>적중률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ranked = r.attempts > 0;
              const pct = Math.round(r.winRate * 100);
              return (
                <tr key={r.member} className={ranked && i < 3 ? 'qualify' : ''}>
                  <td className="muted rank-pos">{ranked ? i + 1 : '—'}</td>
                  <td className="team">
                    {r.member}
                    {ranked && i < 3 ? ` ${medal[i]}` : ''}
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.attempts}</td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>{r.correct}</strong>
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

      {/* 경기별 예측 상세 */}
      {details.length > 0 && (
        <>
          <h2>경기별 예측</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
            누가 무엇을 예상했는지와 실제 결과입니다. (✅ 적중 · ❌ 빗나감 · 결과
            전 경기는 표시 없음)
          </p>
          <div className="pred-list">
            {details.map((d) => {
              const home = toKoreanTeam(d.homeName);
              const away = toKoreanTeam(d.awayName);
              const con = consensus(opinionsByMatch[d.matchId] ?? [], MEMBERS);
              const conCorrect =
                con.agreed && d.result != null ? con.pick === d.result : null;
              return (
                <div className="pred-match card" key={d.matchId}>
                  <div className="pred-match-head">
                    <span className="pred-teams">
                      {home} <span className="muted">vs</span> {away}
                      <span className="muted" style={{ fontSize: 12 }}>
                        {' '}
                        · {formatKickoff(d.kickoff)} ·{' '}
                        {statusText[d.status] ?? d.status}
                      </span>
                    </span>
                    {d.result && d.score ? (
                      <span className="pred-result-chip">
                        결과 {d.score.home}:{d.score.away} ·{' '}
                        {pickLabel[d.result]}
                      </span>
                    ) : (
                      <span className="pred-result-chip pending">결과 대기</span>
                    )}
                  </div>

                  {con.agreed && (
                    <div className="pred-consensus">
                      🤝 3인 합의: <b>{pickLabel[con.pick!]}</b>
                      {conCorrect === true
                        ? ' · ✅ 합의 적중'
                        : conCorrect === false
                          ? ' · ❌ 합의 빗나감'
                          : ''}
                    </div>
                  )}

                  <div className="pred-picks">
                    {d.picks.map((p) => (
                      <span
                        key={p.member}
                        className={`pred-pick ${
                          p.correct === true
                            ? 'ok'
                            : p.correct === false
                              ? 'no'
                              : ''
                        }`}
                      >
                        {p.member} <b>{pickLabel[p.pick]}</b>
                        {p.correct === true
                          ? ' ✅'
                          : p.correct === false
                            ? ' ❌'
                            : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        ※ 종료된 경기에 입력한 의견(승/무/패)만 채점합니다. 무승부 예측도 동일하게
        집계됩니다.
      </p>
    </>
  );
}
