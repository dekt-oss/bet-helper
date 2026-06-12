'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { importBetmanAction, type ImportState } from '@/lib/odds/actions';

const initial: ImportState = { ok: false };

function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? '가져오는 중…' : '베트맨 배당 가져오기'}
    </button>
  );
}

/** 베트맨 gameSlip.do 응답(JSON)을 붙여넣어 월드컵 배당을 일괄 등록. */
export function BetmanImport() {
  const [state, formAction] = useFormState(importBetmanAction, initial);
  return (
    <details className="card" style={{ marginBottom: 24 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        ⚡ 베트맨 배당 일괄 가져오기 (응답 붙여넣기)
      </summary>
      <p className="muted" style={{ fontSize: 13 }}>
        베트맨 승부식 페이지에서 <b>F12 → Network → gameSlip.do</b> 응답을 복사해
        아래에 붙여넣고 가져오기를 누르면, 월드컵 모든 경기의 승/무/패 배당이 한 번에
        등록됩니다.
      </p>
      <form action={formAction}>
        <textarea
          name="json"
          rows={6}
          placeholder='{"currentLottery": ... , "compSchedules": { "keys": [...], "datas": [...] } }'
          style={{ fontFamily: 'monospace', fontSize: 12 }}
          required
        />
        <div className="btn-row" style={{ marginTop: 10 }}>
          <ImportButton />
          {state.error && <span className="error">⚠ {state.error}</span>}
          {state.ok && (
            <span className="success">✓ {state.count}경기 배당 등록됨</span>
          )}
        </div>
      </form>
    </details>
  );
}
