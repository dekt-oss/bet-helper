import type { Match } from '@/lib/types';
import { toKoreanTeam, isKoreaMatch } from '@/lib/teams/korea';

function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso));
}

export function MatchList({ matches }: { matches: Match[] }) {
  if (matches.length === 0) {
    return <p className="muted">표시할 경기가 없습니다.</p>;
  }
  return (
    <div className="card">
      {matches.map((m) => {
        const isLive = m.status === 'LIVE' || m.status === 'PAUSED';
        const korea = isKoreaMatch(m);
        return (
          <div className="match-row" key={m.id}>
            <div>
              <div>
                {korea && <span title="한국 경기">🇰🇷 </span>}
                {toKoreanTeam(m.home.name)} <span className="muted">vs</span>{' '}
                {toKoreanTeam(m.away.name)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {m.stage ? `${m.stage} · ` : ''}
                {formatKickoff(m.kickoff)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {m.score ? (
                <strong>
                  {m.score.home} : {m.score.away}
                </strong>
              ) : (
                <span className="muted">- : -</span>
              )}
              <div>
                <span className={`badge ${isLive ? 'live' : ''}`}>
                  {isLive && m.minute ? `${m.minute}'` : m.status}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
