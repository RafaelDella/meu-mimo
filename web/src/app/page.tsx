import Link from 'next/link';
import Image from 'next/image';
import { MimoBrand, MimoIcon } from '@/components/ui/mimo-icon';
import { PointsSummary } from '@/components/ui/points-summary';

export default function Home() {
  return (
    <div className="welcome">
      <header className="brand" aria-label="Meu Mimo">
        <MimoBrand />
      </header>
      <main className="welcome-layout">
        <div className="welcome-story">
        <p className="eyebrow">Feito de pequenos carinhos</p>
        <h1>Sua lojinha de carinho.</h1>
        <p className="introduction">Um cantinho para celebrar conquistas e transformar pontos em momentos especiais.</p>
        <a className="primary-link" href="https://meu-mimo-carinho.rafael-giustina2.chatgpt.site/">
          Conhecer a demonstração <span aria-hidden="true">↗</span>
        </a>
        <p className="demo-note">Uma prévia com dados de exemplo para você conhecer o Meu Mimo.</p>
        <Link className="preview-link" href="/visual-check">Ver a nova interface</Link>
        <div className="scrapbook-note"><MimoIcon name="heart" /><p>Pequenos gestos.<br />Um montão de afeto.</p><MimoIcon name="sparkle" /></div>
        </div>
        <section className="welcome-shop" aria-label="Uma espiadinha na lojinha, com dados fictícios">
          <div className="preview-phone-top"><MimoIcon name="bow" /><span>Uma espiadinha · Dados fictícios</span><MimoIcon name="heart" /></div>
          <p className="eyebrow">Um cantinho só de vocês</p><h2>Oi, que bom ter você aqui <span aria-hidden="true">♡</span></h2>
          <p className="welcome-shop-caption">Tem carinho esperando por você.</p>
          <PointsSummary storeName="Lojinha de exemplo" available={90} pending={15} />
          <h3>Carinhos à sua espera</h3>
          <div className="welcome-rewards">
            <div><Image src="/assets/coffee.svg" alt="" width={170} height={150} /><p>Café na cama</p><span>Um começo de dia com amor.</span></div>
            <div><Image src="/assets/gift.svg" alt="" width={170} height={150} /><p>Uma surpresa só sua</p><span>Escolhida pensando em você.</span></div>
          </div>
          <p className="welcome-little-note"><MimoIcon name="bow" />Cada passinho merece um carinho.</p>
        </section>
      </main>
      <footer>Pequenas conquistas. Momentos especiais.</footer>
    </div>
  );
}
