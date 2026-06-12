import { getMatches, getOdds } from '@/lib/data-sources';
import { OddsForm } from '@/components/OddsForm';
import { BetmanImport } from '@/components/BetmanImport';
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

      <p
        className="muted"
        style={{ fontSize: 13, background: 'var(--panel)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
      >
        💡 자동 배당(The Odds API)은 해외 북메이커 기준이라 <strong>베트맨 고정배당과 다릅니다</strong>.
        정산은 베팅 시 입력한 배당으로 계산되니, 실제 베팅은 베트맨 배당을 직접 입력(또는 베팅 등록 시 수정)하세요.
        수동 입력값이 항상 우선합니다.
      </p>

      <BetmanImport />

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
                <th>출처</th>
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
                    {o.source === 'betman' ? '✍️ 수동(베트맨)' : '🤖 자동(참고)'}
                  </td>
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
