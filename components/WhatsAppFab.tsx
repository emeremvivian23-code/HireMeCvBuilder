'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

const WHATSAPP_NUMBER = '2347019281041';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=Hello%20HireMeCv%20I%20have%20paid%20for%20Pro`;

export function WhatsAppFab() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform hover:scale-110 active:scale-95 sm:bottom-6"
    >
      <MessageCircle className="h-7 w-7 text-white" />
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-30" />
    </a>
  );
}
