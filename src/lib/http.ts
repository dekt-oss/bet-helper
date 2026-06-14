// 외부 데이터 소스 호출용 공통 fetch 헬퍼.
// 타임아웃을 강제해, 외부 API/네트워크가 느리거나 egress 가 막혀 있을 때
// 서버 렌더가 무한정 멈추는("버퍼링") 현상을 방지한다.

const DEFAULT_TIMEOUT_MS = 6000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // AbortSignal.timeout 은 Node 18+ / 최신 런타임에서 지원.
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    // 타임아웃/네트워크 오류를 호출부가 일관되게 처리할 수 있도록 메시지를 명확히 한다.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`요청 타임아웃(${timeoutMs}ms): ${url}`);
    }
    throw err;
  }
}
