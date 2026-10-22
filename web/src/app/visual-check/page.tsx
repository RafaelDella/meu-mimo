import type { Metadata } from 'next';
import { VisualPreview } from './visual-preview';

export const metadata: Metadata = {
  title: 'Prévia da interface · Meu Mimo',
  description: 'Lojinha, mimo e resumo do lojista com dados fictícios.',
  robots: { index: false, follow: false },
};

export default function VisualCheck() {
  return <VisualPreview />;
}
