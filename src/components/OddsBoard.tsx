'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Outcome, Opinion } from '@/lib/types';
import { BetForm, type OddsTriple } from '@/components/BetForm';
import { OpinionForm } from '@/components/OpinionForm';
import { teamInfo } from '@/lib/teams/info-2026';
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

const pickLabel: Record<Outcome, string> = {
  HOME: '승',
  DRAW: '무',
  AWAY: '패',
};

/** 3인 의견에서 합의(모두 같은 pick) 여부. */
function consensusOf(
  opinions: Opinion[],
  members: string[],
): { agreed: boolean; pick?: Outcome } {
  const picks = members
    .map((m) => opinions.find((o) => o.member === m)?.pick)
    .filter((p): p is Outcome => !!p);
  if (picks.length === members.length && new Set(picks).size === 1) {
    return { agreed: true, pick: picks[0] };
  }
  return { agreed: false };
}

function TeamDetail({ name }: { name: string }) {
  const info = teamInfo(name);
  return (
    <div className="team-detail">
      <div className="team-detail-name">{name}</div>
      {info ? (
        <>
          {info.fifaRank != null && (
            <div className="muted">FIFA 랭킹 {info.fifaRank}위</div>
          )}
          {info.coach && <div className="muted">감독 {info.coach}</div>}
          <div className="team-players">{info.keyPlayers.join(' · ')}</div>
        </>
      ) : (
        <div className="muted">상세 정보 없음</div>
      )}
    </div>
  );
}

export function OddsBoard({
  matches,
  oddsByMatch,
  opinionsByMatch,
  members,
}: {
  matches: MatchOption[];
  oddsByMatch: Record<string, OddsTriple>;
  opinionsByMatch: Record<string, Opinion[]>;
  members: string[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [betPick, setBetPick] = useState<Outcome | undefined>(undefined);

  const withOdds = matches.filter((m) => oddsByMatch[m.id]);

  function openCard(id: string, pick?: Outcome) {
    if (openId === id && pick === undefined) {
      setOpenId(null); // 헤더 재클릭 → 닫기
    } else {
      setOpenId(id);
      setBetPick(pick);
    }
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
        const isOpen = openId === m.id;
        const opinions = opinionsByMatch[m.id] ?? [];
        const consensus = consensusOf(opinions, members);
        const buttons: { key: Outcome; label: string; value: number }[] = [
          { key: 'HOME', label: m.home, value: t.home },
          { key: 'DRAW', label: '무', value: t.draw },
          { key: 'AWAY', label: m.away, value: t.away },
        ];
        return (
          <div
            className={`odds-card ${isOpen ? 'open' : ''} ${m.korea ? 'kr' : ''}`}
            key={m.id}
          >
            <button
              type="button"
              className="odds-card-head"
              onClick={() => openCard(m.id)}
            >
              <span className="odds-card-teams">
                {m.korea && <span title="한국 경기">🇰🇷 </span>}
                {m.home} <span className="muted">vs</span> {m.away}
                {consensus.agreed && (
                  <span className="consensus-badge ok">
                    ✅ 합의 {pickLabel[consensus.pick!]}
                  </span>
                )}
              </span>
              <span className="odds-card-date">{formatKickoff(m.kickoff)}</span>
            </button>

            <div className="odds-pick-row">
              {buttons.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`odds-pick-btn ${p.key.toLowerCase()} ${
                    isOpen && betPick === p.key ? 'active' : ''
                  }`}
                  onClick={() => openCard(m.id, p.key)}
                >
                  <span className="k">{p.label}</span>
                  <b>{p.value.toFixed(2)}</b>
                </button>
              ))}
            </div>

            {isOpen && (
              <div className="odds-detail">
                {/* 팀 상세 */}
                <div className="detail-block">
                  <h4>경기 정보</h4>
                  <div className="team-detail-row">
                    <TeamDetail name={m.home} />
                    <TeamDetail name={m.away} />
                  </div>
                </div>

                {/* 3인 의견 / 합의 */}
                <div className="detail-block">
                  <h4>
                    3인 의견
                    {consensus.agreed ? (
                      <span className="consensus-badge ok">
                        합의됨 · {pickLabel[consensus.pick!]} 추천
                      </span>
                    ) : (
                      <span className="consensus-badge warn">미합의</span>
                    )}
                  </h4>
                  {members.map((mem) => (
                    <OpinionForm
                      key={mem}
                      matchId={m.id}
                      member={mem}
                      current={opinions.find((o) => o.member === mem)}
                      homeLabel={m.home}
                      awayLabel={m.away}
                    />
                  ))}
                </div>

                {/* 베팅 */}
                <div className="detail-block">
                  <h4>베팅 등록</h4>
                  {!consensus.agreed && (
                    <p className="warn-text">
                      ⚠ 아직 3인 합의 전입니다. 합의 후 베팅을 권장합니다.
                    </p>
                  )}
                  <BetForm
                    matches={matches}
                    oddsByMatch={oddsByMatch}
                    initialMatchId={m.id}
                    initialPick={betPick}
                    embedded
                    onSuccess={() => {
                      setOpenId(null);
                      router.refresh();
                    }}
                  />
                  <Link
                    href={`/bets?match=${encodeURIComponent(m.id)}`}
                    className="muted"
                    style={{ fontSize: 13 }}
                  >
                    베팅내역 탭에서 열기 →
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
