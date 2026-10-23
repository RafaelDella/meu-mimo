import type { SVGProps } from 'react';

export type MimoIconName = 'bow' | 'heart' | 'sparkle' | 'home' | 'activities' | 'gift' | 'people';

const paths: Record<MimoIconName, string> = {
  bow: 'M11 10C4-1-2 4 2 9c2 3 6 2 9 1Zm2 0c7-11 13-6 9-1-2 3-6 2-9 1ZM10 12l-4 8 5-2 1-6m2 0 4 8-5-2-1-6',
  heart: 'M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z',
  sparkle: 'm12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z',
  activities: 'm3 6 2 2 3-4m3 2h10M3 13l2 2 3-4m3 2h10M4 20h2m5 0h10',
  gift: 'M3 11h18V7H3Zm2 0v10h14V11M12 7v14M12 7H8.5A3.5 3.5 0 1 1 12 3.5V7Zm0 0h3.5A3.5 3.5 0 1 0 12 3.5V7Z',
  people: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9v-2a7 7 0 0 1 14 0v2m0-17a4 4 0 0 1 0 8m3 3a6 6 0 0 1 3 5v1',
};

export function MimoIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: MimoIconName }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>;
}

export function MimoBrand() {
  return <><MimoIcon name="bow" className="mimo-brand-bow" /><span>meu mimo<span className="brand-dot">.</span></span></>;
}
