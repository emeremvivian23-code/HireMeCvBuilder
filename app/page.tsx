'use client';

import { useState, useEffect } from 'react';
import { AppProvider } from '@/lib/context';
import { useAuth } from '@/lib/auth-context';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BottomNav } from '@/components/BottomNav';
import { CVTab } from '@/components/CVTab';
import { ResumeTab } from '@/components/ResumeTab';
import { CoverLetterTab } from '@/components/CoverLetterTab';
import { ProSection } from '@/components/ProSection';
import { TabId } from '@/lib/types';
import { ReferralSection } from '@/components/ReferralSection';
import { captureReferralCode } from '@/lib/referral';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('cv');
  const { profile } = useAuth();

  useEffect(() => {
    captureReferralCode();
  }, []);

  return (
    <div className="min-h-screen bg-light-gray flex flex-col">
      <Header />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 pb-28">
        {activeTab === 'cv' && <CVTab />}
        {activeTab === 'resume' && <ResumeTab />}
        {activeTab === 'cover-letter' && <CoverLetterTab />}

        <div className="mt-8">
          <ProSection />
        </div>

        {profile && (
          <div className="mt-8">
            <ReferralSection />
          </div>
        )}
      </main>

      <Footer />
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
