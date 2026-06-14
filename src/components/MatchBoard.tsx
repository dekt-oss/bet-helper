'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Match, Outcome, Opinion, Bet } from '@/lib/types';
import { BetForm, type OddsTriple } from '@/components/BetForm';
import { OpinionForm } from '@/components/OpinionForm';
import { teamInfo } from '@/lib/teams/info-2026';
import { consensus } from '@/lib/opinions/consensus';
import type { MatchOption } from '@/lib/teams/options';
import {
  toKoreanTeam,
  isKoreaMatch,
  koreanGroupName,
  sortKoreaFirst,
} from '@/lib/teams/korea';

type SortKey = 'korea' | 'date' | 'group';

const statusText: Record<string, string> = {
  SCHEDULED: '예정',
  LIVE: '진행중',
  PAUSED: '하프타임',
  FINISHED: '종료',
  POSTPONED: '연기',
  CANCELLED: '취소',
};
const pickLabel: Record<Outcome, string> = { HOME: '승', DRAW: '무', AWAY: '패' };
const betStatusLabel: Record<string, string> = {
  PENDING: '대기',
  WON: '적중',
  LOST: '미적중',
  VOID: '무효',
};

function pickText(pick: Outcome, home: string, away: string): string {
  if (pick === 'HOME') return `${home} 승`;
  if (pick === 'AWAY') return `${away} 승`;
  return '무승부';
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

// 배당 출처 라벨. 베트맨이 실제 베팅 사이트라 강조한다.
function oddsSourceLabel(source?: string): string {
  if (source === 'betman') return '🟢 베트맨';
  if (source === 'oddsapi') return '자동(Odds API)';
  if (source === 'manual') return '수동 입력';
  return '';
}

// 갱신 시각을 'M/D HH:MM' 로(KST).
function formatOddsTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(d);
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

export function MatchBoard({
  matches,
  oddsByMatch,
  opinionsByMatch,
  betsByMatch,
  betOptions,
  consensusMembers,
  opinionMembers,
  advisoryMembers,
}: {
  matches: Match[];
  oddsByMatch: Record<string, OddsTriple>;
  opinionsByMatch: Record<string, Opinion[]>;
  betsByMatch: Record<string, Bet[]>;
  betOptions: MatchOption[];
  consensusMembers: string[];
  opinionMembers: string[];
  advisoryMembers: string[];
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>('korea');
  const [filter, setFilter] = useState<string>('all');
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [betPick, setBetPick] = useState<Outcome | undefined>(undefined);
  const [editOps, setEditOps] = useState(false);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      const g = koreanGroupName(m.stage);
      if (/^[A-L]조$/.test(g)) set.add(g);
    }
    return [...set].sort();
  }, [matches]);

  const view = useMemo(() => {
    let list = matches;
    if (onlyUpcoming)
      list = list.filter(
        (m) =>
          m.status === 'SCHEDULED' ||
          m.status === 'LIVE' ||
          m.status === 'PAUSED',
      );
    if (filter === 'korea') list = list.filter(isKoreaMatch);
    else if (filter !== 'all')
      list = list.filter((m) => koreanGroupName(m.stage) === filter);

    if (sort === 'korea') return sortKoreaFirst(list);
    if (sort === 'date')
      return [...list].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    return [...list].sort((a, b) => {
      const ga = koreanGroupName(a.stage) || 'zzz';
      const gb = koreanGroupName(b.stage) || 'zzz';
      return ga.localeCompare(gb) || a.kickoff.localeCompare(b.kickoff);
    });
  }, [matches, sort, filter, onlyUpcoming]);

  function openCard(id: string, pick?: Outcome) {
    if (openId === id && pick === undefined) {
      setOpenId(null);
    } else {
      setOpenId(id);
      setBetPick(pick);
      setEditOps(false);
    }
  }

  return (
    <>
      <div className="filter-bar">
        <label className="inline">
          정렬
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="korea">한국 우선</option>
            <option value="date">날짜순</option>
            <option value="group">조별</option>
          </select>
        </label>
        <label className="inline">
          보기
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체</option>
            <option value="korea">🇰🇷 한국 경기</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="inline checkbox">
          <input
            type="checkbox"
            checked={onlyUpcoming}
            onChange={(e) => setOnlyUpcoming(e.target.checked)}
          />
          예정/진행중만
        </label>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {view.length}경기
        </span>
      </div>

      <div className="odds-board">
        {view.map((m) => {
          const korea = isKoreaMatch(m);
          const group = koreanGroupName(m.stage);
          const home = toKoreanTeam(m.home.name);
          const away = toKoreanTeam(m.away.name);
          const isLive = m.status === 'LIVE' || m.status === 'PAUSED';
          const bettable =
            m.status === 'SCHEDULED' || m.status === 'LIVE' || m.status === 'PAUSED';
          const t = oddsByMatch[m.id];
          const isOpen = openId === m.id;
          const opinions = opinionsByMatch[m.id] ?? [];
          const con = consensus(opinions, consensusMembers);
          const myBets = betsByMatch[m.id] ?? [];

          const buttons: { key: Outcome; label: string; value: number }[] = t
            ? [
                { key: 'HOME', label: home, value: t.home },
                { key: 'DRAW', label: '무', value: t.draw },
                { key: 'AWAY', label: away, value: t.away },
              ]
            : [];

          return (
            <div
              className={`odds-card ${isOpen ? 'open' : ''} ${korea ? 'kr' : ''}`}
              key={m.id}
            >
              <button
                type="button"
                className="odds-card-head"
                onClick={() => openCard(m.id)}
              >
                <span className="odds-card-teams">
                  {korea && <span title="한국 경기">🇰🇷 </span>}
                  {group && <span className="stage-tag">{group}</span>}
                  {home} <span className="muted">vs</span> {away}
                  {con.agreed && (
                    <span className="consensus-badge ok">
                      ✅ 합의 {pickLabel[con.pick!]}
                    </span>
                  )}
                  {myBets.length > 0 && (
                    <span className="bet-badge">🎫 베팅 {myBets.length}건</span>
                  )}
                </span>
                <span className="odds-card-right">
                  {m.score ? (
                    <strong>
                      {m.score.home} : {m.score.away}
                    </strong>
                  ) : null}
                  <span
                    className={`badge ${isLive ? 'live' : ''} ${
                      m.status === 'FINISHED' ? 'finished' : ''
                    }`}
                  >
                    {isLive && m.minute
                      ? `${m.minute}'`
                      : (statusText[m.status] ?? m.status)}
                  </span>
                  <span className="odds-card-date">{formatKickoff(m.kickoff)}</span>
                </span>
              </button>

              {buttons.length > 0 && (
                <>
                  <div className="odds-pick-row">
                    {buttons.map((p) =>
                      bettable ? (
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
                      ) : (
                        // 종료/연기 경기는 클릭 불가, 마지막 배당만 표시(지나간 경기 배당 보존).
                        <div
                          key={p.key}
                          className={`odds-pick-btn ${p.key.toLowerCase()}`}
                          style={{ cursor: 'default', opacity: 0.7 }}
                        >
                          <span className="k">{p.label}</span>
                          <b>{p.value.toFixed(2)}</b>
                        </div>
                      ),
                    )}
                  </div>
                  {t?.source && (
                    <div
                      className="muted"
                      style={{ fontSize: 11, padding: '2px 10px 0', lineHeight: 1.5 }}
                    >
                      {oddsSourceLabel(t.source)} 배당
                      {t.updatedAt ? ` · 갱신 ${formatOddsTime(t.updatedAt)}` : ''}
                      {t.source === 'betman' ? ' · 자동 갱신' : ''}
                    </div>
                  )}
                </>
              )}

              {isOpen && (
                <div className="odds-detail">
                  {/* 팀 정보 */}
                  <div className="detail-block">
                    <h4>경기 정보</h4>
                    <div className="team-detail-row">
                      <TeamDetail name={home} />
                      <TeamDetail name={away} />
                    </div>
                  </div>

                  {/* 의견 / 합의 */}
                  <div className="detail-block">
                    <h4>
                      3인 의견
                      {con.agreed ? (
                        <span className="consensus-badge ok">
                          합의됨 · {pickLabel[con.pick!]}
                        </span>
                      ) : (
                        <span className="consensus-badge warn">미합의</span>
                      )}
                    </h4>
                    <div className="opinion-summary">
                      {opinionMembers.map((mem) => {
                        const o = opinions.find((x) => x.member === mem);
                        const adv = advisoryMembers.includes(mem);
                        return (
                          <span key={mem} className="opinion-chip">
                            {mem}
                            {adv && <span className="muted">(참고)</span>}:{' '}
                            <b>{o?.pick ? pickLabel[o.pick] : '—'}</b>
                            {o?.comment ? ` · ${o.comment}` : ''}
                          </span>
                        );
                      })}
                    </div>
                    {bettable ? (
                      <>
                        <button
                          type="button"
                          className="opinion-toggle"
                          onClick={() => setEditOps((v) => !v)}
                        >
                          {editOps ? '− 닫기' : '+ 의견 입력/수정'}
                        </button>
                        {editOps && (
                          <div className="opinion-edit-list">
                            {opinionMembers.map((mem) => (
                              <OpinionForm
                                key={mem}
                                matchId={m.id}
                                member={mem}
                                current={opinions.find((o) => o.member === mem)}
                                homeLabel={home}
                                awayLabel={away}
                                advisory={advisoryMembers.includes(mem)}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="muted" style={{ fontSize: 12 }}>
                        종료된 경기는 의견 입력이 불가합니다.
                      </p>
                    )}
                  </div>

                  {/* 내 베팅 이력 */}
                  {myBets.length > 0 && (
                    <div className="detail-block">
                      <h4>베팅 이력 ({myBets.length}건)</h4>
                      {myBets.map((b) => (
                        <div key={b.id} className="bet-line">
                          <span>{pickText(b.pick, home, away)}</span>
                          <span className="muted">
                            {b.stake.toLocaleString('ko-KR')}원 · 배당{' '}
                            {b.oddsAtPlacement.toFixed(2)}
                          </span>
                          <span>{betStatusLabel[b.status] ?? b.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 베팅 또는 결과 */}
                  <div className="detail-block">
                    <h4>{bettable ? '베팅 등록' : '결과'}</h4>
                    {bettable ? (
                      <>
                        {!con.agreed && (
                          <p className="warn-text">
                            ⚠ 아직 3인 합의 전입니다. 합의 후 베팅을 권장합니다.
                          </p>
                        )}
                        <BetForm
                          matches={betOptions}
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
                      </>
                    ) : (
                      <p className="muted">
                        {m.score
                          ? `${home} ${m.score.home} : ${m.score.away} ${away}`
                          : statusText[m.status] ?? m.status}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
