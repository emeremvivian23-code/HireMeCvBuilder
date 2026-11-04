import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { WhatsAppFab } from '@/components/WhatsAppFab';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HireMe CV — ATS CV + Resume + Cover Letter For Every Job',
  description:
    'Create professional CVs, resumes, and cover letters tailored to your target job. Stand out, get noticed, get hired.',
  openGraph: {
    title: 'HireMe CV — ATS CV + Resume + Cover Letter For Every Job',
    description:
      'Create professional CVs, resumes, and cover letters tailored to your target job.',
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <WhatsAppFab />
        </AuthProvider>
      </body>
    </html>
  );
}
