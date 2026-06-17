'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Match } from '@/lib/types';
import { toKoreanTeam, isKoreaMatch, koreanGroupName } from '@/lib/teams/korea';

export interface OddsTriple {
  home: number;
  draw: number;
  away: number;
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

function formatKickoffFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

const statusText: Record<string, string> = {
  SCHEDULED: '예정',
  LIVE: '진행중',
  PAUSED: '하프타임',
  FINISHED: '종료',
  POSTPONED: '연기',
  CANCELLED: '취소',
};

function OddsChips({ odds }: { odds: OddsTriple }) {
  return (
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
  );
}

function MatchRow({ m, odds, betted }: { m: Match; odds?: OddsTriple; betted?: boolean }) {
  const [open, setOpen] = useState(false);
  const isLive = m.status === 'LIVE' || m.status === 'PAUSED';
  const korea = isKoreaMatch(m);
  const group = koreanGroupName(m.stage);

  return (
    <div className={`match-item ${open ? 'open' : ''} ${korea ? 'kr' : ''}`}>
      <div
        className="match-row"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div style={{ minWidth: 0 }}>
          {betted && <span className="bet-tag">🎯 베팅한 경기</span>}
          <div>
            {korea && <span title="한국 경기">🇰🇷 </span>}
            {group && <span className="stage-tag">{group}</span>}
            {toKoreanTeam(m.home.name)} <span className="muted">vs</span>{' '}
            {toKoreanTeam(m.away.name)}
          </div>
          <div className="match-date">{formatKickoff(m.kickoff)}</div>
          {odds && <OddsChips odds={odds} />}
        </div>
        <div className="match-row-right">
          {m.score ? (
            <strong style={{ fontSize: 18 }}>
              {m.score.home} : {m.score.away}
            </strong>
          ) : (
            <span className="muted">vs</span>
          )}
          <div>
            <span
              className={`badge ${isLive ? 'live' : ''} ${
                m.status === 'FINISHED' ? 'finished' : ''
              }`}
            >
              {isLive && m.minute
                ? `${m.minute}'`
                : (statusText[m.status] ?? m.status)}
            </span>
          </div>
          <span className="row-caret" aria-hidden>
            ▾
          </span>
        </div>
      </div>

      {open && (
        <>
        <dl className="match-detail">
          <div>
            <dt>일시</dt>
            <dd>{formatKickoffFull(m.kickoff)}</dd>
          </div>
          <div>
            <dt>대회</dt>
            <dd>{m.competition}</dd>
          </div>
          {(group || m.stage) && (
            <div>
              <dt>조/라운드</dt>
              <dd>{group || m.stage}</dd>
            </div>
          )}
          <div>
            <dt>상태</dt>
            <dd>
              {statusText[m.status] ?? m.status}
              {isLive && m.minute ? ` · ${m.minute}'` : ''}
            </dd>
          </div>
          {m.venue && (
            <div>
              <dt>경기장</dt>
              <dd>{m.venue}</dd>
            </div>
          )}
          {m.matchday && (
            <div>
              <dt>매치데이</dt>
              <dd>{m.matchday}</dd>
            </div>
          )}
          {m.score && (
            <div>
              <dt>스코어</dt>
              <dd>
                {toKoreanTeam(m.home.name)} {m.score.home} : {m.score.away}{' '}
                {toKoreanTeam(m.away.name)}
              </dd>
            </div>
          )}
          {m.scorers &&
            (m.scorers.home.length > 0 || m.scorers.away.length > 0) && (
              <div>
                <dt>득점자</dt>
                <dd>
                  {m.scorers.home.length > 0 && (
                    <div>
                      <span className="muted">{toKoreanTeam(m.home.name)}</span>{' '}
                      {m.scorers.home.join(', ')}
                    </div>
                  )}
                  {m.scorers.away.length > 0 && (
                    <div>
                      <span className="muted">{toKoreanTeam(m.away.name)}</span>{' '}
                      {m.scorers.away.join(', ')}
                    </div>
                  )}
                </dd>
              </div>
            )}
          {odds && (
            <div>
              <dt>배당</dt>
              <dd>
                <OddsChips odds={odds} />
              </dd>
            </div>
          )}
        </dl>
        {m.status === 'SCHEDULED' && (
          <div className="match-detail-actions">
            <Link
              href={`/fixtures?match=${encodeURIComponent(m.id)}`}
              className="bet-link"
            >
              🎯 이 경기 베팅하기 →
            </Link>
          </div>
        )}
        </>
      )}
    </div>
  );
}

export function MatchList({
  matches,
  oddsByMatch,
  bettedIds,
}: {
  matches: Match[];
  oddsByMatch?: Record<string, OddsTriple>;
  /** 우리가 베팅한 경기 id 목록 — 해당 경기에 "베팅한 경기" 배지 표시 */
  bettedIds?: string[];
}) {
  if (matches.length === 0) {
    return <p className="muted">표시할 경기가 없습니다.</p>;
  }
  const betted = new Set(bettedIds ?? []);
  return (
    <div className="card">
      {matches.map((m) => (
        <MatchRow
          key={m.id}
          m={m}
          odds={oddsByMatch?.[m.id]}
          betted={betted.has(m.id)}
        />
      ))}
    </div>
  );
}
