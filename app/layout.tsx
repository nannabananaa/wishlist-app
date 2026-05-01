import type { Metadata } from 'next';
import { Geist, Fraunces } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '900'],
});

export const metadata: Metadata = {
  title: "Tianna's Wishlist 🎀",
  description: 'A cozy little wishlist for Tianna & Isaiah',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
