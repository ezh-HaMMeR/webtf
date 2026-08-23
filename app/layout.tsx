import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WebTF — браузерный просмотр QuakeWorld-демо',
  description:
    'Технический прототип браузерного MVD-плеера для QWTF.NET на базе FTEQW WebAssembly.',
  openGraph: {
    title: 'WEBTF',
    description: 'MVD demo player for QWTF.NET',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'WEBTF — MVD demo player for QWTF.NET' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WEBTF',
    description: 'MVD demo player for QWTF.NET',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
