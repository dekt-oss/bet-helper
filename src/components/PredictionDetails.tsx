'use client';

import { useMemo, useState } from 'react';
import type { MatchPrediction } from '@/lib/opinions/leaderboard';
import type { Outcome } from '@/lib/types';
import { toKoreanTeam } from '@/lib/teams/korea';

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

type Filter = 'all' | 'graded' | 'upcoming';

export function PredictionDetails({ details }: { details: MatchPrediction[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const gradedCount = useMemo(
    () => details.filter((d) => d.result != null).length,
    [details],
  );
  const upcomingCount = details.length - gradedCount;

  const view = useMemo(() => {
    if (filter === 'graded') return details.filter((d) => d.result != null);
    if (filter === 'upcoming') return details.filter((d) => d.result == null);
    return details;
  }, [details, filter]);

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: `전체 ${details.length}` },
    { key: 'graded', label: `종료 ${gradedCount}` },
    { key: 'upcoming', label: `예정 ${upcomingCount}` },
  ];

  return (
    <>
      <div className="pred-filter">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pred-filter-btn ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          해당하는 경기가 없습니다.
        </p>
      ) : (
        <div className="pred-list">
          {view.map((d) => {
            const home = toKoreanTeam(d.homeName);
            const away = toKoreanTeam(d.awayName);
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
                      결과 {d.score.home}:{d.score.away} · {pickLabel[d.result]}
                    </span>
                  ) : (
                    <span className="pred-result-chip pending">결과 대기</span>
                  )}
                </div>

                {d.consensusPick && (
                  <div className="pred-consensus">
                    🤝 3인 합의: <b>{pickLabel[d.consensusPick]}</b>
                    {d.consensusCorrect === true
                      ? ' · ✅ 합의 적중'
                      : d.consensusCorrect === false
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
      )}
    </>
  );
}
