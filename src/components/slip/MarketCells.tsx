'use client';

// 한 경기의 전 마켓(승무패·핸디캡·언더오버) 배당 셀.
// 셀을 누르면 구매 슬립에 폴이 담긴다(한 경기당 1폴 — 다른 셀을 누르면 교체).

import type { LegPick, MarketOdds, MarketType } from '@/lib/types';
import { useSlip, type SlipLeg } from './SlipProvider';

function fmtLine(n: number): string {
  // 홈 기준 핸디 표기: +1, -1.5 …
  return n > 0 ? `+${n}` : `${n}`;
}

export function MarketCells({
  matchId,
  matchLabel,
  home,
  away,
  markets,
}: {
  matchId: string;
  matchLabel: string;
  home: string;
  away: string;
  markets: MarketOdds[];
}) {
  const slip = useSlip();
  const current = slip.legOf(matchId);

  const x2 = markets.filter((m) => m.market === '1X2');
  const hd = markets
    .filter((m) => m.market === 'HANDICAP')
    .sort((a, b) => (a.handicap ?? 0) - (b.handicap ?? 0));
  const ou = markets
    .filter((m) => m.market === 'OU')
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

  function add(
    market: MarketType,
    pick: LegPick,
    pickLabel: string,
    odds: number,
    line?: number,
  ) {
    const leg: SlipLeg = { matchId, matchLabel, market, pick, pickLabel, odds, line };
    slip.toggle(leg);
  }

  function isActive(market: MarketType, pick: LegPick, line?: number): boolean {
    return (
      !!current &&
      current.market === market &&
      current.pick === pick &&
      (current.line ?? null) === (line ?? null)
    );
  }

  function Cell({
    market,
    pick,
    label,
    odds,
    line,
    pickLabel,
  }: {
    market: MarketType;
    pick: LegPick;
    label: string;
    odds?: number;
    line?: number;
    pickLabel: string;
  }) {
    if (odds == null) return null;
    return (
      <button
        type="button"
        className={`mkt-cell ${isActive(market, pick, line) ? 'active' : ''}`}
        onClick={() => add(market, pick, pickLabel, odds, line)}
      >
        <span className="mkt-cell-k">{label}</span>
        <b>{odds.toFixed(2)}</b>
      </button>
    );
  }

  if (markets.length === 0) {
    return <p className="muted" style={{ fontSize: 12 }}>아직 배당이 없습니다.</p>;
  }

  return (
    <div className="mkt-wrap">
      {x2.length > 0 && (
        <div className="mkt-group">
          <div className="mkt-title">승무패</div>
          <div className="mkt-row">
            <Cell market="1X2" pick="HOME" label={`${home} 승`} pickLabel={`${home} 승`} odds={x2[0].home} />
            <Cell market="1X2" pick="DRAW" label="무" pickLabel="무승부" odds={x2[0].draw} />
            <Cell market="1X2" pick="AWAY" label={`${away} 승`} pickLabel={`${away} 승`} odds={x2[0].away} />
          </div>
        </div>
      )}

      {hd.map((m) => {
        const ln = m.handicap ?? 0;
        const tag = `(${fmtLine(ln)})`;
        return (
          <div className="mkt-group" key={`hd-${ln}`}>
            <div className="mkt-title">핸디캡 <span className="muted">{home} {fmtLine(ln)}</span></div>
            <div className="mkt-row">
              <Cell market="HANDICAP" pick="HOME" label={`${home} 승`} pickLabel={`${home} 승${tag}`} odds={m.home} line={ln} />
              <Cell market="HANDICAP" pick="DRAW" label="무" pickLabel={`무승부${tag}`} odds={m.draw} line={ln} />
              <Cell market="HANDICAP" pick="AWAY" label={`${away} 승`} pickLabel={`${away} 승${tag}`} odds={m.away} line={ln} />
            </div>
          </div>
        );
      })}

      {ou.map((m) => {
        const ln = m.line ?? 0;
        return (
          <div className="mkt-group" key={`ou-${ln}`}>
            <div className="mkt-title">언더오버 <span className="muted">기준 {ln}</span></div>
            <div className="mkt-row">
              <Cell market="OU" pick="OVER" label={`오버 ${ln}`} pickLabel={`오버 ${ln}`} odds={m.over} line={ln} />
              <Cell market="OU" pick="UNDER" label={`언더 ${ln}`} pickLabel={`언더 ${ln}`} odds={m.under} line={ln} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
