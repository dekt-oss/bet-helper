'use client';

import { useMemo, useState } from 'react';
import type { Match } from '@/lib/types';
import { MatchList, type OddsTriple } from '@/components/MatchList';
import {
  sortKoreaFirst,
  isKoreaMatch,
  koreanGroupName,
} from '@/lib/teams/korea';

type SortKey = 'korea' | 'date' | 'group';
type GroupFilter = 'all' | 'korea' | string; // 'all' | 'korea' | "A조"

export function FixturesView({
  matches,
  oddsByMatch,
}: {
  matches: Match[];
  oddsByMatch: Record<string, OddsTriple>;
}) {
  const [sort, setSort] = useState<SortKey>('korea');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);

  // 존재하는 조 목록(A조, B조…)
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
        (m) => m.status === 'SCHEDULED' || m.status === 'LIVE',
      );
    if (filter === 'korea') list = list.filter(isKoreaMatch);
    else if (filter !== 'all')
      list = list.filter((m) => koreanGroupName(m.stage) === filter);

    if (sort === 'korea') return sortKoreaFirst(list);
    if (sort === 'date')
      return [...list].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    // group: 조 → 날짜
    return [...list].sort((a, b) => {
      const ga = koreanGroupName(a.stage) || 'zzz';
      const gb = koreanGroupName(b.stage) || 'zzz';
      return ga.localeCompare(gb) || a.kickoff.localeCompare(b.kickoff);
    });
  }, [matches, sort, filter, onlyUpcoming]);

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
      <MatchList matches={view} oddsByMatch={oddsByMatch} />
    </>
  );
}
