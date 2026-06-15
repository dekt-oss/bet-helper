import { getMatches, getOdds, resolveMatchIds } from '@/lib/data-sources';
import { type OddsTriple } from '@/components/BetForm';
import { MatchBoard } from '@/components/MatchBoard';
import { OddsForm } from '@/components/OddsForm';
import { BetmanImport } from '@/components/BetmanImport';
import { AutoRefresh } from '@/components/AutoRefresh';
import { OddsHealthBanner } from '@/components/OddsHealthBanner';
import { getBetmanHeartbeat } from '@/lib/odds/status';
import { buildMatchOptions } from '@/lib/teams/options';
import { listOpinions, groupByMatch } from '@/lib/opinions/store';
import { listBetsSettled } from '@/lib/bets/store';
import { MEMBERS, OPINION_MEMBERS, ADVISORY_MEMBERS } from '@/lib/pool/config';
import type { Bet } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function FixturesPage({
  searchParams,
}: {
  searchParams?: { match?: string };
}) {
  const [{ matches, source }, { odds, api }, opinions, heartbeat] = await Promise.all([
    getMatches(),
    getOdds(),
    listOpinions(),
    getBetmanHeartbeat(),
  ]);
  const bets = await listBetsSettled(matches);

  const oddsByMatch: Record<string, OddsTriple> = {};
  for (const o of odds)
    oddsByMatch[o.matchId] = {
      home: o.home,
      draw: o.draw,
      away: o.away,
      source: o.source,
      updatedAt: o.updatedAt,
    };

  // 의견은 옛(오염된) 데이터를 복구하지 않는다 — 깨끗한 상태에서 새로 시작.
  // (옛 ID 로 저장된 의견은 표시되지 않음. 지금부터 입력하는 의견만 반영)
  const opinionsByMatch = groupByMatch(opinions);
  const betsByMatch: Record<string, Bet[]> = {};
  for (const b of resolveMatchIds(bets, matches))
    (betsByMatch[b.matchId] ??= []).push(b);
  const betOptions = buildMatchOptions(matches);

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
        <h1 style={{ marginBottom: 4 }}>경기·베팅</h1>
        <AutoRefresh />
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>
        총 {matches.length}경기 · 배당 {api ? '자동(The Odds API)' : '수동 입력'} ·
        출처 {source} · 경기를 누르면 정보·3인 의견·베팅
      </p>

      <OddsHealthBanner odds={odds} matches={matches} heartbeat={heartbeat} />

      <MatchBoard
        matches={matches}
        initialOpenId={searchParams?.match}
        oddsByMatch={oddsByMatch}
        opinionsByMatch={opinionsByMatch}
        betsByMatch={betsByMatch}
        betOptions={betOptions}
        consensusMembers={MEMBERS}
        opinionMembers={OPINION_MEMBERS}
        advisoryMembers={ADVISORY_MEMBERS}
      />

      {/* 보조: 베트맨 배당 직접 입력 / 가져오기 */}
      <details className="odds-tools" style={{ marginTop: 28 }}>
        <summary>배당 직접 입력 / 베트맨 가져오기</summary>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          💡 자동 배당(The Odds API)은 해외 북메이커 기준이라 <strong>베트맨 고정배당과 다릅니다</strong>.
          실제 베팅은 베트맨 배당을 입력(또는 베팅 등록 시 수정)하세요. 수동 입력값이 항상 우선합니다.
        </p>
        <BetmanImport />
        <OddsForm matches={betOptions} />
      </details>
    </>
  );
}
