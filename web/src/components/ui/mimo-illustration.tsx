import Image from 'next/image';
import type { Illustration } from '@/contracts/illustrations';

export function MimoIllustration({ name, className }: { name: Illustration; className?: string }) {
  return <Image src={`/assets/${name}.svg`} alt="" aria-hidden="true" width={170} height={150} className={className} />;
}
