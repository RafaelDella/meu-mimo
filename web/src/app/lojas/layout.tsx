import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Suas lojas · Meu Mimo',
  robots: { index: false, follow: false },
};

export default function StoresLayout({ children }: { children: ReactNode }) { return children; }
