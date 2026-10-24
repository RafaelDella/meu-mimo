import { displayInvitationCode, normalizeInvitationCode } from '@/lib/invitation-code';
import styles from './invitation-codes.module.css';

export function InvitationCodeDisplay({ code }: { code: string }) {
  const normalized = normalizeInvitationCode(code);
  if (!normalized) return null;
  return <div className={styles.display} role="group" aria-label={`Código de convite: ${displayInvitationCode(normalized)}`}>
    <span className={styles.caption} aria-hidden="true">Código de convite</span>
    <div className={styles.visor} aria-hidden="true">
      <span className={styles.codeGroup}>{[...normalized.slice(0, 5)].map((letter, index) => <span className={styles.cell} key={index}>{letter}</span>)}</span>
      <span className={styles.separator}>-</span>
      <span className={styles.codeGroup}>{[...normalized.slice(5)].map((letter, index) => <span className={styles.cell} key={index}>{letter}</span>)}</span>
    </div>
  </div>;
}
