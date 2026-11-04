'use client';

import { useState, useCallback } from 'react';
import { incrementDownloadCount } from '@/lib/activities';

type Html2PdfFn = () => {
  set: (opts: Record<string, unknown>) => {
    from: (el: HTMLElement) => { save: () => Promise<void> };
  };
};

async function loadHtml2Pdf(): Promise<Html2PdfFn> {
  const mod = await import('html2pdf.js');
  return (mod.default ?? mod) as unknown as Html2PdfFn;
}

interface UsePdfDownloadOptions {
  activityId?: string;
}

export function usePdfDownload({ activityId }: UsePdfDownloadOptions = {}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (elementId: string, filename: string) => {
      setError(null);
      const el = document.getElementById(elementId);
      if (!el) {
        setError('Could not find the document to download.');
        return false;
      }
      setDownloading(true);
      try {
        const html2pdf = await loadHtml2Pdf();
        await html2pdf()
          .set({
            margin: [10, 10, 10, 10],
            filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          })
          .from(el)
          .save();

        if (activityId) await incrementDownloadCount(activityId);
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong while creating the PDF. Please try again.'
        );
        return false;
      } finally {
        setDownloading(false);
      }
    },
    [activityId]
  );

  return { downloading, error, download };
}
