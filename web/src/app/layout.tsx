import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../server/only';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Meu Mimo — sua lojinha de carinho',
  description: 'Um cantinho para celebrar conquistas e transformar pontos em momentos especiais.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
