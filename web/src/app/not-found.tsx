import Link from 'next/link';
import { MimoIntro, MimoMasthead } from '@/components/ui/mimo-page';

export default function NotFound() {
  return <main className="account-shell"><MimoMasthead /><MimoIntro kind="envelope">
    <p className="mimo-eyebrow">Esse cantinho não está por aqui</p><h1>Página não encontrada</h1>
    <p>Confira o endereço ou volte para o início do Meu Mimo.</p>
    <Link className="primary-link" href="/">Voltar ao início</Link>
  </MimoIntro></main>;
}
