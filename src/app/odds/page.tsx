import { getMatches, getOdds } from '@/lib/data-sources';
import { OddsForm } from '@/components/OddsForm';
import { AutoRefresh } from '@/components/AutoRefresh';
import { buildMatchOptions } from '@/lib/teams/options';
import { toKoreanTeam } from '@/lib/teams/korea';

export const dynamic = 'force-dynamic';

export default async function OddsPage() {
  const [{ matches }, { odds, scraper, api }] = await Promise.all([
    getMatches(),
    getOdds(),
  ]);
  const options = buildMatchOptions(matches);
  const matchName = new Map(
    matches.map((m) => [
      m.id,
      `${toKoreanTeam(m.home.name)} vs ${toKoreanTeam(m.away.name)}`,
    ]),
  );

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
        <h1 style={{ marginBottom: 4 }}>베트맨 승부식</h1>
        <AutoRefresh />
      </div>
      <p className="muted">
        승/무/패(1X2) 배당 · 자동 배당{' '}
        {api ? '켜짐(The Odds API)' : '꺼짐'}
        {scraper ? ' · 베트맨 스크래퍼 켜짐' : ''} · 수동 입력은 항상 우선
      </p>

      <OddsForm matches={options} />

      {odds.length === 0 ? (
        <p className="muted">
          아직 입력된 배당이 없습니다. 위 폼에서 베트맨 배당을 입력하세요.
        </p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>경기</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>갱신</th>
              </tr>
            </thead>
            <tbody>
              {odds.map((o) => (
                <tr key={o.matchId}>
                  <td>{matchName.get(o.matchId) ?? o.externalRef ?? o.matchId}</td>
                  <td>{o.home.toFixed(2)}</td>
                  <td>{o.draw.toFixed(2)}</td>
                  <td>{o.away.toFixed(2)}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(o.updatedAt).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
