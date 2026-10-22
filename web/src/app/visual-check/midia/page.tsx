import type { Metadata } from 'next';
import { MediaPreview } from './preview';

export const metadata: Metadata = { title: 'Prévia de mídia · Meu Mimo', robots: { index: false, follow: false } };
export default function Page() { return <MediaPreview />; }
