import type { Odds, Match } from '@/lib/types';

// 베트맨 자동 수집이 살아있는지 한눈에 보여주는 배너.
// 마지막 베트맨 배당 갱신이 STALE_MIN 분을 넘으면 "수집 멈춤"으로 보고 재로그인을 안내한다.
// (수집기가 매 사이클 성공 시 odds.updatedAt 을 갱신하므로, 멈추면 시각이 굳는다.)
const STALE_MIN = Number(process.env.ODDS_STALE_MINUTES ?? '180'); // 기본 3시간

// 수집기 주기와 동일 규칙: 가까운 경기(아래 시간 이내)면 자주, 아니면 기본.
const NEAR_INTERVAL_MIN = 90;
const BASE_INTERVAL_MIN = 120;
const NEAR_WINDOW_HOURS = 12;

// 오전/오후 형식: "6.14 오후 12:09"
function fmtKst(ms: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Seoul',
  }).format(ms);
}

function agoText(min: number): string {
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return `${h}시간 ${min % 60}분 전`;
}

/** 가장 가까운 예정/진행 경기까지의 시간으로 다음 수집 간격(분)을 추정. */
function expectedIntervalMin(matches: Match[]): number {
  const now = Date.now();
  let nearest = Infinity;
  for (const m of matches) {
    if (m.status !== 'SCHEDULED' && m.status !== 'LIVE' && m.status !== 'PAUSED') continue;
    const t = new Date(m.kickoff).getTime();
    if (Number.isFinite(t) && t > now && t < nearest) nearest = t;
  }
  if (nearest !== Infinity && nearest - now <= NEAR_WINDOW_HOURS * 3_600_000) {
    return NEAR_INTERVAL_MIN;
  }
  return BASE_INTERVAL_MIN;
}

export function OddsHealthBanner({
  odds,
  matches = [],
  heartbeat,
}: {
  odds: Odds[];
  matches?: Match[];
  /** 수집기 마지막 성공 시각(ISO). 있으면 이를 권위 있는 '마지막 갱신'으로 사용. */
  heartbeat?: string | null;
}) {
  // 우선순위: 수집 하트비트(실제 마지막 수집) > 화면에 보이는 베트맨 배당 updatedAt 최대값.
  const hbMs = heartbeat ? new Date(heartbeat).getTime() : NaN;
  const times = odds
    .filter((o) => o.source === 'betman')
    .map((o) => new Date(o.updatedAt).getTime())
    .filter((n) => Number.isFinite(n));
  const lastMs = Number.isFinite(hbMs)
    ? hbMs
    : times.length > 0
      ? Math.max(...times)
      : NaN;
  if (!Number.isFinite(lastMs)) return null; // 베트맨 수집 기록이 없으면 배너 숨김
  const minAgo = Math.round((Date.now() - lastMs) / 60_000);
  const stale = minAgo > STALE_MIN;

  // 다음 갱신 예정: 마지막 갱신 + 주기. 이미 지났으면 다음 '미래' 주기로 투영
  // (lastUpdate+interval 이 과거가 되어 지난 시각이 뜨던 문제 방지).
  const intervalMin = expectedIntervalMin(matches);
  const sinceMin = (Date.now() - lastMs) / 60_000;
  const cycles = Math.max(1, Math.ceil(sinceMin / intervalMin));
  const nextMs = lastMs + cycles * intervalMin * 60_000;
  const minToNext = Math.max(0, Math.round((nextMs - Date.now()) / 60_000));
  const nextText = `${fmtKst(nextMs)} (${minToNext}분 후)`;

  const base: React.CSSProperties = {
    borderRadius: 10,
    padding: '10px 14px',
    margin: '10px 0 4px',
    fontSize: 13,
    lineHeight: 1.5,
    border: '1px solid',
    wordBreak: 'keep-all',
  };
  const style: React.CSSProperties = stale
    ? { ...base, background: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5' }
    : { ...base, background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#86efac' };

  return (
    <div style={style} role={stale ? 'alert' : undefined}>
      {stale ? (
        <>
          🔴 <strong>베트맨 자동 수집이 멈춘 것 같아요</strong> — 마지막 갱신 {agoText(minAgo)}(
          {fmtKst(lastMs)}). 수집기 PC에서 <code>npm run login</code> 을 한 번 실행해 주세요.
        </>
      ) : (
        <>
          🟢 베트맨 자동 수집 중 · 마지막 갱신 {agoText(minAgo)} ({fmtKst(lastMs)}) · 다음 갱신 예정{' '}
          {nextText}
        </>
      )}
    </div>
  );
}
