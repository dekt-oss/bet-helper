// 페이지 전환 시 즉시 보이는 스켈레톤. 느린 서버 렌더를 기다리는 동안
// 빈 화면 대신 골격을 보여줘 "전환이 빠르다"고 느끼게 한다(체감 속도 개선).
export default function Loading() {
  const block: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    border: '1px solid var(--border)',
  };
  return (
    <div aria-busy="true" aria-label="불러오는 중" style={{ opacity: 0.7 }}>
      <div style={{ ...block, height: 34, width: 180, marginBottom: 16 }} />
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div style={{ ...block, height: 84 }} />
        <div style={{ ...block, height: 84 }} />
        <div style={{ ...block, height: 84 }} />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ ...block, height: 96 }} />
        ))}
      </div>
    </div>
  );
}
