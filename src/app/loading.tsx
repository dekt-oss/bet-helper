// 라우트 레벨 로딩 UI.
// App Router 는 동적 페이지 전환 시 서버 렌더가 끝날 때까지 화면이 멈춘 듯 보이는데,
// 이 파일이 있으면 전환 즉시 스켈레톤이 떠 "버퍼링" 체감을 없앤다.
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <span className="spinner" />
        <span className="muted">불러오는 중…</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="skeleton" style={{ height: 84 }} />
        <div className="skeleton" style={{ height: 84 }} />
        <div className="skeleton" style={{ height: 84 }} />
      </div>

      <div
        className="skeleton"
        style={{ height: 28, width: 180, marginTop: 28 }}
      />
      <div className="skeleton" style={{ height: 200, marginTop: 12 }} />
    </div>
  );
}
