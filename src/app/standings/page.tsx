import { getMatches } from '@/lib/data-sources';
import { computeStageSections } from '@/lib/standings';
import { MatchList } from '@/components/MatchList';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function StandingsPage() {
  const { matches } = await getMatches();
  const sections = computeStageSections(matches);

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
        <h1 style={{ marginBottom: 4 }}>순위 · 대진</h1>
        <AutoRefresh />
      </div>
      <p className="muted">승 3점 · 무 1점 · 상위 2팀 진출 (초록) · 진행 단계가 맨 위</p>

      {sections.length === 0 ? (
        <p className="muted">
          아직 순위 데이터가 없습니다. (조편성/대진이 확정되면 표시됩니다)
        </p>
      ) : (
        sections.map((s) => (
          <section key={s.title} style={{ marginTop: 28 }}>
            <h2 style={{ margin: '0 0 12px' }}>
              {s.title}
              {s.active && <span className="stage-now">진행중</span>}
            </h2>

            {s.kind === 'group' ? (
              <div className="standings-grid">
                {s.groups.map((g) => (
                  <div className="card standings-card" key={g.group}>
                    <h3 style={{ margin: '0 0 8px' }}>{g.group}</h3>
                    <table className="standings-table">
                      <thead>
                        <tr>
                          <th style={{ width: 18 }}></th>
                          <th>팀</th>
                          <th title="경기수">경기</th>
                          <th title="승-무-패">승무패</th>
                          <th title="득실차">득실</th>
                          <th title="승점">점</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr key={r.team} className={i < 2 ? 'qualify' : ''}>
                            <td className="muted">{i + 1}</td>
                            <td className="team">{r.team}</td>
                            <td>{r.played}</td>
                            <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                              {r.win}-{r.draw}-{r.loss}
                            </td>
                            <td>
                              {r.gd > 0 ? '+' : ''}
                              {r.gd}
                            </td>
                            <td>
                              <strong>{r.points}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <MatchList matches={s.matches} />
            )}
          </section>
        ))
      )}
    </>
  );
}
