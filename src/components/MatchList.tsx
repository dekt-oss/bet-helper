import type { Match } from '@/lib/types';
import { toKoreanTeam, isKoreaMatch, koreanGroupName } from '@/lib/teams/korea';

export interface OddsTriple {
  home: number;
  draw: number;
  away: number;
}

function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso));
}

const statusText: Record<string, string> = {
  SCHEDULED: '예정',
  LIVE: '진행중',
  PAUSED: '하프타임',
  FINISHED: '종료',
  POSTPONED: '연기',
  CANCELLED: '취소',
};

export function MatchList({
  matches,
  oddsByMatch,
}: {
  matches: Match[];
  oddsByMatch?: Record<string, OddsTriple>;
}) {
  if (matches.length === 0) {
    return <p className="muted">표시할 경기가 없습니다.</p>;
  }
  return (
    <div className="card">
      {matches.map((m) => {
        const isLive = m.status === 'LIVE' || m.status === 'PAUSED';
        const korea = isKoreaMatch(m);
        const group = koreanGroupName(m.stage);
        const odds = oddsByMatch?.[m.id];
        return (
          <div className="match-row" key={m.id}>
            <div style={{ minWidth: 0 }}>
              <div>
                {korea && <span title="한국 경기">🇰🇷 </span>}
                {group && <span className="stage-tag">{group}</span>}
                {toKoreanTeam(m.home.name)} <span className="muted">vs</span>{' '}
                {toKoreanTeam(m.away.name)}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {formatKickoff(m.kickoff)}
              </div>
              {odds && (
                <div className="odds-chips">
                  <span className="odds-chip">
                    <span className="k">승</span>
                    <b>{odds.home.toFixed(2)}</b>
                  </span>
                  <span className="odds-chip">
                    <span className="k">무</span>
                    <b>{odds.draw.toFixed(2)}</b>
                  </span>
                  <span className="odds-chip">
                    <span className="k">패</span>
                    <b>{odds.away.toFixed(2)}</b>
                  </span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {m.score ? (
                <strong style={{ fontSize: 18 }}>
                  {m.score.home} : {m.score.away}
                </strong>
              ) : (
                <span className="muted">vs</span>
              )}
              <div>
                <span className={`badge ${isLive ? 'live' : ''}`}>
                  {isLive && m.minute
                    ? `${m.minute}'`
                    : (statusText[m.status] ?? m.status)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
