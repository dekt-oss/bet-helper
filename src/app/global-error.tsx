'use client';

// 최후의 에러 경계 — 루트 레이아웃 자체에서 오류가 났을 때만 동작한다.
// global-error 는 자체 <html>/<body> 를 렌더해야 한다.
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: '#0f1115',
          color: '#e6e8ec',
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h2>⚠ 앱에 문제가 발생했습니다</h2>
          <p style={{ color: '#9aa3b2' }}>
            잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해 주세요.
          </p>
          {(error?.message || error?.digest) && (
            <pre
              style={{
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: '#9aa3b2',
                textAlign: 'left',
                marginTop: 12,
              }}
            >
              {error.message}
              {error.digest ? `\n(${error.digest})` : ''}
            </pre>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #3ddc84',
              background: '#3ddc84',
              color: '#0f1115',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
