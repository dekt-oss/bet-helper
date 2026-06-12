import { getMatches } from '@/lib/data-sources';
import { computeGroupStandings } from '@/lib/standings';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function StandingsPage() {
  const { matches } = await getMatches();
  const groups = computeGroupStandings(matches);

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
        <h1 style={{ marginBottom: 4 }}>조별리그 순위</h1>
        <AutoRefresh />
      </div>
      <p className="muted">종료된 경기 기준 승점·득실 집계 (승 3점 / 무 1점)</p>

      {groups.length === 0 ? (
        <p className="muted">
          아직 조별리그 데이터가 없습니다. (대회 조편성이 확정되면 표시됩니다)
        </p>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {groups.map((g) => (
            <div className="card table-wrap" key={g.group}>
              <h3 style={{ marginTop: 0 }}>{g.group}</h3>
              <table>
                <thead>
                  <tr>
                    <th>팀</th>
                    <th title="경기수">경기</th>
                    <th title="승">승</th>
                    <th title="무">무</th>
                    <th title="패">패</th>
                    <th title="득실차">득실</th>
                    <th title="승점">점</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={r.team}>
                      <td>
                        <span className="muted" style={{ marginRight: 6 }}>
                          {i + 1}
                        </span>
                        {r.team}
                      </td>
                      <td>{r.played}</td>
                      <td>{r.win}</td>
                      <td>{r.draw}</td>
                      <td>{r.loss}</td>
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
      )}
    </>
  );
}
