import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { RealtimeBets } from '@/components/RealtimeBets';
import { SlipProvider } from '@/components/slip/SlipProvider';
import { SlipPanel } from '@/components/slip/SlipPanel';

export const metadata: Metadata = {
  title: '구구뱃 — 월드컵 공동 베팅 관리',
  description:
    '월드컵 경기일정·실시간 현황·배당·우리 모임 베팅내역을 한곳에서 관리',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              ⚽ 구구뱃
            </Link>
            <nav>
              <Link href="/">대시보드</Link>
              <Link href="/fixtures">경기·베팅</Link>
              <Link href="/standings">조별순위</Link>
              <Link href="/bets">베팅내역</Link>
              <Link href="/ranking">예측순위</Link>
              <Link href="/pool">정산</Link>
            </nav>
          </div>
        </header>
        <SlipProvider>
          <main className="container">{children}</main>
          <SlipPanel />
        </SlipProvider>
        <RealtimeBets />
      </body>
    </html>
  );
}
