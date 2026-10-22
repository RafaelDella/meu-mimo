import Link from 'next/link';

export default function Home() {
  return (
    <div className="welcome">
      <header className="brand" aria-label="Meu Mimo">
        <span className="brand-heart" aria-hidden="true">♡</span>
        <span>Meu Mimo<span className="brand-dot">.</span></span>
      </header>
      <main className="welcome-card">
        <span className="gift-mark" aria-hidden="true">♡</span>
        <p className="eyebrow">Feito de pequenos carinhos</p>
        <h1>Sua lojinha de carinho.</h1>
        <p className="introduction">Um cantinho para celebrar conquistas e transformar pontos em momentos especiais.</p>
        <a className="primary-link" href="https://meu-mimo-carinho.rafael-giustina2.chatgpt.site/">
          Conhecer a demonstração <span aria-hidden="true">↗</span>
        </a>
        <p className="demo-note">Uma prévia com dados de exemplo para você conhecer o Meu Mimo.</p>
        <Link className="preview-link" href="/visual-check">Ver a nova interface</Link>
      </main>
      <footer>Pequenas conquistas. Momentos especiais.</footer>
    </div>
  );
}
