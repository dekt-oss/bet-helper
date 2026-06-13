'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Outcome } from '@/lib/types';
import { BetForm, type OddsTriple } from '@/components/BetForm';
import type { MatchOption } from '@/lib/teams/options';

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

/**
 * 배팅사이트 스타일 승부식 보드.
 * 경기 카드마다 승/무/패 배당 버튼을 띄우고, 누르면 그 자리에서 베팅 폼이 펼쳐진다.
 */
export function OddsBoard({
  matches,
  oddsByMatch,
}: {
  matches: MatchOption[];
  oddsByMatch: Record<string, OddsTriple>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; pick: Outcome } | null>(null);

  const withOdds = matches.filter((m) => oddsByMatch[m.id]);

  function toggle(id: string, pick: Outcome) {
    setOpen((cur) =>
      cur && cur.id === id && cur.pick === pick ? null : { id, pick },
    );
  }

  if (withOdds.length === 0) {
    return (
      <p className="muted">
        표시할 배당이 없습니다. 아래에서 배당을 입력하거나 자동 수집을 설정하세요.
      </p>
    );
  }

  return (
    <div className="odds-board">
      {withOdds.map((m) => {
        const t = oddsByMatch[m.id];
        const isOpen = open?.id === m.id;
        const picks: { key: Outcome; label: string; value: number }[] = [
          { key: 'HOME', label: m.home, value: t.home },
          { key: 'DRAW', label: '무', value: t.draw },
          { key: 'AWAY', label: m.away, value: t.away },
        ];
        return (
          <div className={`odds-card ${isOpen ? 'open' : ''}`} key={m.id}>
            <div className="odds-card-head">
              <span className="odds-card-teams">
                {m.korea && <span title="한국 경기">🇰🇷 </span>}
                {m.home} <span className="muted">vs</span> {m.away}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {formatKickoff(m.kickoff)}
              </span>
            </div>
            <div className="odds-pick-row">
              {picks.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`odds-pick-btn ${p.key.toLowerCase()} ${
                    isOpen && open?.pick === p.key ? 'active' : ''
                  }`}
                  onClick={() => toggle(m.id, p.key)}
                >
                  <span className="k">{p.label}</span>
                  <b>{p.value.toFixed(2)}</b>
                </button>
              ))}
            </div>
            {isOpen && (
              <div className="odds-bet-panel">
                <BetForm
                  matches={matches}
                  oddsByMatch={oddsByMatch}
                  initialMatchId={m.id}
                  initialPick={open!.pick}
                  embedded
                  onSuccess={() => {
                    setOpen(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
