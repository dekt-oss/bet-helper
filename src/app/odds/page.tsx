import { getOdds } from '@/lib/data-sources';

export const dynamic = 'force-dynamic';

export default async function OddsPage() {
  const { odds, enabled } = await getOdds();

  return (
    <>
      <h1>배당 (베트맨 승부식)</h1>
      {!enabled ? (
        <div className="card">
          <p>
            베트맨 배당 스크래퍼가 <strong>비활성화</strong> 상태입니다.
          </p>
          <p className="muted">
            <code>.env.local</code> 에 <code>ENABLE_BETMAN_SCRAPER=true</code> 를
            설정하고 <code>src/lib/data-sources/betman.ts</code> 의 파싱 로직을
            구현하면 1X2 배당이 여기에 표시됩니다.
          </p>
        </div>
      ) : odds.length === 0 ? (
        <p className="muted">현재 수집된 배당이 없습니다.</p>
      ) : (
        <div className="card">
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
                  <td>{o.externalRef ?? o.matchId}</td>
                  <td>{o.home.toFixed(2)}</td>
                  <td>{o.draw.toFixed(2)}</td>
                  <td>{o.away.toFixed(2)}</td>
                  <td className="muted">
                    {new Date(o.updatedAt).toLocaleString('ko-KR')}
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
