import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MimoBrand, MimoIcon } from './mimo-icon';

export type MimoIllustration = 'kitten' | 'journal' | 'ticket' | 'envelope' | 'gift';

export function MimoSticker({ kind, className = '' }: { kind: MimoIllustration; className?: string }) {
  const kitten = kind === 'kitten';
  return <Image className={`mimo-sticker ${className}`} src={kitten ? '/assets/mimo-kitten.png' : `/assets/${kind}.svg`}
    alt="" aria-hidden="true" width={kitten ? 1312 : 170} height={kitten ? 1199 : 150} sizes="(max-width: 600px) 96px, 160px" />;
}

export function MimoMasthead() {
  return <div className="mimo-masthead"><Link className="mimo-brand" href="/" aria-label="Meu Mimo — início"><MimoBrand /></Link>
    <span className="mimo-masthead-note"><MimoIcon name="heart" />feito de pequenos carinhos</span></div>;
}

export function MimoIntro({ kind, children }: { kind: MimoIllustration; children: ReactNode }) {
  return <div className={`mimo-intro ${kind === 'ticket' || kind === 'gift' ? 'mimo-intro-cream' : ''}`}>
    <div className="mimo-intro-copy">{children}</div>
    <div className="mimo-intro-art" aria-hidden="true"><MimoSticker kind={kind} /><MimoIcon name="sparkle" /></div>
  </div>;
}

export function MimoEmpty({ kind, children }: { kind: MimoIllustration; children: ReactNode }) {
  return <div className="mimo-empty"><MimoSticker kind={kind} /><div>{children}</div></div>;
}
