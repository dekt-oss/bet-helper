/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 클라이언트 라우터 캐시 유지 시간(초).
    // 동적 페이지를 잠깐 사이 다시 방문(뒤로/앞으로/탭 전환)할 때
    // 서버 재요청 없이 캐시에서 즉시 보여줘 전환 버퍼링을 없앤다.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
