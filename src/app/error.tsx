'use client';

// 세그먼트 에러 경계.
// 이 파일이 없으면 어떤 오류든 Next 의 일반 "Application error: a client-side
// exception" 화면으로 앱 전체가 붕괴한다. 여기서 친절한 한글 메시지와
// "다시 시도" 버튼을 제공해 오류를 해당 영역으로 격리하고 복구 가능하게 한다.
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 운영 환경에서도 콘솔로 원인을 남긴다.
    console.error('[page error]', error);
  }, [error]);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>⚠ 화면을 불러오지 못했습니다</h2>
      <p className="muted">
        일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.
      </p>
      {error.digest && (
        <p className="muted" style={{ fontSize: 12 }}>
          오류 코드: {error.digest}
        </p>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="primary" onClick={() => reset()}>
          다시 시도
        </button>
      </div>
    </div>
  );
}
