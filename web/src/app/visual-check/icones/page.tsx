import Link from 'next/link';
import { illustrations } from '@/contracts/illustrations';
import { MimoIllustration } from '@/components/ui/mimo-illustration';
import styles from './page.module.css';

export default function IllustrationGallery() {
  return <main className={styles.page}>
    <Link href="/visual-check">Voltar às composições</Link>
    <h1>Biblioteca de carinho</h1>
    <p>Os mesmos desenhos para os seus mimos e as suas atividades.</p>
    <div className={styles.gallery}>
      {illustrations.map(option => <figure key={option.value} className={styles.card}>
        <MimoIllustration name={option.value} className={styles.illustration} />
        <figcaption>{option.label}</figcaption>
      </figure>)}
    </div>
  </main>;
}
