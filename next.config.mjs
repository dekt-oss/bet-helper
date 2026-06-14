/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // 승부식·경기일정 병합 → /odds 는 /fixtures(경기·베팅)로 이동.
    return [{ source: '/odds', destination: '/fixtures', permanent: false }];
  },
};

export default nextConfig;
