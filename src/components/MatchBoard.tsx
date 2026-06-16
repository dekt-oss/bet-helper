'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Match, Outcome, Opinion, Bet, MarketOdds, LegPick } from '@/lib/types';
import type { OddsTriple } from '@/components/BetForm';
import { OpinionForm } from '@/components/OpinionForm';
import { useSlip } from '@/components/slip/SlipProvider';
import { MarketCells } from '@/components/slip/MarketCells';
import { teamInfo } from '@/lib/teams/info-2026';
import { consensus } from '@/lib/opinions/consensus';
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
  initialOpenId,
  oddsByMatch,
  marketsByMatch,
  opinionsByMatch,
  betsByMatch,
  consensusMembers,
  opinionMembers,
  advisoryMembers,
}: {
  matches: Match[];
  initialOpenId?: string;
  oddsByMatch: Record<string, OddsTriple>;
  marketsByMatch?: Record<string, MarketOdds[]>;
  opinionsByMatch: Record<string, Opinion[]>;
  betsByMatch: Record<string, Bet[]>;
  consensusMembers: string[];
  opinionMembers: string[];
  advisoryMembers: string[];
}) {
  const slip = useSlip();
  const [sort, setSort] = useState<SortKey>('korea');
  const [filter, setFilter] = useState<string>('all');
  // 기본값: 예정/진행중만 보기(끝난 경기는 체크 해제 시 표시).
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editOps, setEditOps] = useState(false);

  // 의견/베팅 저장 시 서버 액션 revalidate 로 컴포넌트가 다시 마운트되면 열린 카드가
  // 닫혀 보일 수 있다. 열린 경기를 sessionStorage 에 보존해 저장 후에도 펼쳐진 상태 유지.
  const OPEN_KEY = 'gugu-open-match';
  const EDIT_KEY = 'gugu-open-editops';
  useEffect(() => {
    // 다른 화면에서 '이 경기 베팅하기'로 넘어온 경우(?match=) 그 경기를 펼친다.
    if (initialOpenId) {
      setOpenId(initialOpenId);
      return;
    }
    const saved = sessionStorage.getItem(OPEN_KEY);
    if (saved) {
      setOpenId(saved);
      if (sessionStorage.getItem(EDIT_KEY) === '1') setEditOps(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (openId) sessionStorage.setItem(OPEN_KEY, openId);
    else sessionStorage.removeItem(OPEN_KEY);
  }, [openId]);
  useEffect(() => {
    if (editOps) sessionStorage.setItem(EDIT_KEY, '1');
    else sessionStorage.removeItem(EDIT_KEY);
  }, [editOps]);

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

  function openCard(id: string) {
    if (openId === id) {
      setOpenId(null);
    } else {
      setOpenId(id);
      setEditOps(false);
    }
  }

  // 1X2 배당 셀 → 구매 슬립에 담기(한 경기당 1폴, 재클릭 토글).
  function addOneX2(
    m: Match,
    home: string,
    away: string,
    pick: LegPick,
    odds: number,
  ) {
    const pickLabel = pick === 'HOME' ? `${home} 승` : pick === 'AWAY' ? `${away} 승` : '무승부';
    slip.toggle({
      matchId: m.id,
      matchLabel: `${home} vs ${away}`,
      market: '1X2',
      pick,
      pickLabel,
      odds,
    });
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
          const opinionCount = opinions.filter(
            (o) => o.pick || o.comment,
          ).length;
          const myBets = betsByMatch[m.id] ?? [];
          const slipLeg = slip.legOf(m.id);

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
                  {opinionCount > 0 && !con.agreed && (
                    <span className="opinion-badge">💬 의견 {opinionCount}명</span>
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
                            slipLeg?.market === '1X2' && slipLeg.pick === p.key
                              ? 'active'
                              : ''
                          }`}
                          onClick={() => addOneX2(m, home, away, p.key, p.value)}
                          title="구매 슬립에 담기"
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
                  {/* 진행 상황(스코어·득점자·경기장) — 진행중/종료 또는 스코어/득점자 있을 때 */}
                  {(m.score ||
                    isLive ||
                    (m.scorers &&
                      (m.scorers.home.length > 0 || m.scorers.away.length > 0))) && (
                    <div className="detail-block">
                      <h4>
                        진행 상황
                        {isLive && m.minute
                          ? ` · ${m.minute}'`
                          : m.status === 'FINISHED'
                            ? ' · 종료'
                            : ''}
                      </h4>
                      {m.score && (
                        <div className="live-score">
                          {home} <b>{m.score.home}</b>
                          <span className="muted"> : </span>
                          <b>{m.score.away}</b> {away}
                        </div>
                      )}
                      {m.scorers &&
                        (m.scorers.home.length > 0 || m.scorers.away.length > 0) && (
                          <div className="scorers">
                            {m.scorers.home.length > 0 && (
                              <div>
                                <span className="muted">⚽ {home}</span>{' '}
                                {m.scorers.home.join(', ')}
                              </div>
                            )}
                            {m.scorers.away.length > 0 && (
                              <div>
                                <span className="muted">⚽ {away}</span>{' '}
                                {m.scorers.away.join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      {m.venue && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          경기장: {m.venue}
                        </div>
                      )}
                    </div>
                  )}

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
                      {con.status === 'agreed' ? (
                        <span className="consensus-badge ok">
                          합의됨 · {pickLabel[con.pick!]}
                        </span>
                      ) : con.status === 'disagree' ? (
                        <span className="consensus-badge warn">미합치 (의견 갈림)</span>
                      ) : (
                        <span className="consensus-badge none">
                          미입력 ({con.enteredCount}/{con.total})
                        </span>
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

                  {/* 베팅(마켓 선택) 또는 결과 */}
                  <div className="detail-block">
                    <h4>{bettable ? '베팅 (마켓 선택)' : '결과'}</h4>
                    {bettable ? (
                      <>
                        {con.status === 'incomplete' && (
                          <p className="warn-text neutral">
                            아직 3인 의견 미입력입니다 ({con.enteredCount}/{con.total}). 모두
                            입력 후 베팅을 권장합니다.
                          </p>
                        )}
                        {con.status === 'disagree' && (
                          <p className="warn-text">
                            ⚠ 3인 의견이 갈렸습니다(미합치). 합의 후 베팅을 권장합니다.
                          </p>
                        )}
                        <MarketCells
                          matchId={m.id}
                          matchLabel={`${home} vs ${away}`}
                          home={home}
                          away={away}
                          markets={marketsByMatch?.[m.id] ?? []}
                        />
                        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          🧾 담은 항목은 화면 우하단 <b>구매 슬립</b>에서 금액 입력 후
                          구매하세요. 여러 경기를 담으면 <b>조합(다폴)</b>으로 총배당이 곱해집니다.
                        </p>
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
