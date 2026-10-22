'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PointsSummary } from '@/components/ui/points-summary';

export function VisualPreview() {
  const [mimo, setMimo] = useState<'coffee' | 'ticket' | null>(null);
  const coffeeRef = useRef<HTMLButtonElement>(null);
  const ticketRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(false);
  const invalid = checked && !name.trim();
  const isCoffee = mimo === 'coffee';

  function checkExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecked(true);
    if (!name.trim()) nameRef.current?.focus();
  }

  return (
    <div className="preview-shell">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="preview-header">
        <Link className="preview-brand" href="/" prefetch={false} aria-label="Meu Mimo — início">
          <svg viewBox="0 0 44 32" width="40" height="32" fill="none" aria-hidden="true">
            <path d="M22 16C5-9-6 21 22 16Zm0 0C39-9 50 21 22 16Zm0 0-8 14m8-14 8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>meu mimo<span className="brand-dot">.</span></span>
        </Link>
        <span className="preview-label">Prévia visual · Dados fictícios</span>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <div className="preview-intro">
          <p className="eyebrow">Pequenos gestos, grandes sorrisos</p>
          <h1>Um carinho em cada conquista</h1>
          <p>Uma espiadinha no que estamos preparando para vocês.</p>
          <nav className="preview-nav" aria-label="Composições da prévia">
            <a href="#lojinha">Lojinha</a>
            <a href="#mimo">Detalhe do mimo</a>
            <a href="#lojista">Resumo do lojista</a>
          </nav>
        </div>

        <div className="preview-grid">
          <section className="preview-shop" id="lojinha" aria-labelledby="shop-title">
            <div className="section-heading">
              <p className="eyebrow">01 · Para quem recebe</p>
              <h2 id="shop-title">Sua lojinha</h2>
              <p>Oi, Ana! Que bom ter você por aqui <span aria-hidden="true">♡</span></p>
            </div>
            <div className="points-collage">
              <PointsSummary storeName="Mimos do Rafa" available={90} pending={15} />
              <Image className="kitten-sticker" src="/assets/mimo-kitten.png" alt="" width={1312} height={1199} sizes="114px" />
            </div>

            <div className="catalog-heading">
              <h3>Carinhos à sua espera</h3>
              <span aria-hidden="true">✦</span>
            </div>
            <div className="reward-grid">
              <article className="reward-card">
                <div className="reward-art"><Image src="/assets/coffee.svg" alt="" width={170} height={150} /></div>
                <div className="reward-copy">
                  <h4>Café da manhã na cama</h4>
                  <p>Seu jeito favorito de começar o dia.</p>
                  <p className="point-price">120 <span>pontos</span></p>
                  <Button ref={coffeeRef} onClick={() => setMimo('coffee')}>Ver café da manhã</Button>
                </div>
              </article>
              <article className="reward-card reward-cream">
                <div className="reward-art"><Image src="/assets/envelope.svg" alt="" width={170} height={150} /></div>
                <div className="reward-copy">
                  <h4>Vale-louça</h4>
                  <p>Hoje a pia fica por minha conta.</p>
                  <p className="point-price">60 <span>pontos</span></p>
                  <Button ref={ticketRef} variant="secondary" onClick={() => setMimo('ticket')}>Ver vale-louça</Button>
                </div>
              </article>
            </div>

            <aside className="love-note" aria-label="Bilhete do Rafa">
              <p className="eyebrow">Um bilhetinho para você</p>
              <p>“Cada passinho seu merece um carinho. Estou torcendo por você!”</p>
              <span>Com amor, Rafa <span aria-hidden="true">♡</span></span>
            </aside>
          </section>

          <section className="preview-detail" id="mimo" aria-labelledby="detail-title">
            <div className="section-heading">
              <p className="eyebrow">02 · Feito para alguém especial</p>
              <h2 id="detail-title">Um mimo de pertinho</h2>
              <p>Os detalhes também são parte do presente.</p>
            </div>
            <article className="detail-card">
              <div className="detail-art"><Image src="/assets/gift.svg" alt="" width={170} height={150} /></div>
              <div className="detail-copy">
                <StatusBadge tone="info" text="Mimo de exemplo" />
                <h3>Uma surpresa só sua</h3>
                <p>Um presente escolhido com cuidado, embrulhado com um bocadinho de mistério.</p>
                <p className="point-price">300 <span>pontos</span></p>
                <div className="detail-note">Para comemorar cada conquista, do seu jeitinho.</div>
              </div>
            </article>
            <div className="empty-state">
              <span aria-hidden="true">♡</span>
              <h3>Nenhum momento por aqui ainda</h3>
              <p>As lembranças de vocês vão ganhar um cantinho especial.</p>
            </div>
          </section>

          <section className="preview-merchant" id="lojista" aria-labelledby="merchant-title">
            <div className="section-heading">
              <p className="eyebrow">03 · Para quem prepara</p>
              <h2 id="merchant-title">Cantinho do lojista</h2>
              <p>Oi, Rafa! Aqui o carinho ganha forma.</p>
            </div>
            <div className="merchant-grid">
              <div className="merchant-summary">
                <h3>Um olhar sobre a sua lojinha</h3>
                <dl className="merchant-counts">
                  <div><dt>Registros para analisar</dt><dd>2</dd></div>
                  <div><dt>Mimos a realizar</dt><dd>1</dd></div>
                  <div><dt>Pessoas convidadas</dt><dd>2</dd></div>
                </dl>
                <h4>Pequenas conquistas</h4>
                <ul className="activity-list">
                  <li><div><strong>Ana foi à academia</strong><span>15 pontos · Hoje</span></div><StatusBadge tone="pending" text="Em análise" /></li>
                  <li><div><strong>Ana leu um pouquinho</strong><span>5 pontos · Ontem</span></div><StatusBadge tone="success" text="Aprovado" /></li>
                </ul>
                <p className="preview-caption">Dados fictícios do lojista. Cada pessoa tem seu próprio saldo.</p>
              </div>
              <form className="example-form" onSubmit={checkExample} noValidate>
                <p className="eyebrow">Um mimo começa com uma ideia</p>
                <h3>Como vai se chamar?</h3>
                <Input ref={nameRef} label="Nome do mimo" name="mimo" value={name}
                  onChange={event => setName(event.target.value)} required maxLength={120}
                  hint="Por exemplo: uma noite de cinema." error={invalid ? 'Escreva o nome do mimo.' : undefined} />
                <Button type="submit">Conferir exemplo</Button>
                <p className="preview-caption">Este campo é só uma demonstração. Nada será salvo.</p>
                <p className="form-feedback" role="status">{checked && name.trim() ? 'Que nome carinhoso! Este exemplo está pronto.' : ''}</p>
              </form>
            </div>
          </section>
        </div>
      </main>
      <footer className="preview-footer">Feito de pequenos carinhos <span aria-hidden="true">♡</span><br />Prévia com dados fictícios. Sem contas, resgates ou alterações de saldo.</footer>

      <Dialog open={mimo !== null} onOpenChange={open => { if (!open) setMimo(null); }}
        title={isCoffee ? 'Café da manhã na cama' : 'Vale-louça'}
        description={isCoffee ? 'Um começo de dia feito com carinho, do café ao último pedacinho de pão.' : 'Um vale para deixar a pia por minha conta e aproveitar seu tempo.'}
        returnFocusRef={isCoffee ? coffeeRef : ticketRef}>
        <div className={`dialog-art ${isCoffee ? '' : 'dialog-art-cream'}`}>
          <Image src={isCoffee ? '/assets/coffee.svg' : '/assets/envelope.svg'} alt="" width={170} height={150} />
        </div>
        {isCoffee ? (
          <div className="dialog-details">
            <p className="point-price">120 <span>pontos</span></p>
            <p>Seu saldo disponível: <strong>90 pontos</strong>. Os 15 pontos em análise ainda não estão disponíveis.</p>
            <StatusBadge tone="pending" text="Faltam 30 pontos para este mimo." />
            <p className="detail-note">“Deixa que eu cuido do café. Você só precisa acordar.” — Rafa</p>
          </div>
        ) : (
          <div className="ticket-preview">
            <p className="eyebrow">Prévia de ticket</p>
            <p className="ticket-name">Vale uma folguinha da louça</p>
            <p>60 pontos · Para Ana, com carinho</p>
            <StatusBadge tone="info" text="Ticket de exemplo" />
            <p>Nenhum ponto será descontado nesta prévia.</p>
          </div>
        )}
        <p className="preview-caption">Apenas uma composição com dados fictícios.</p>
      </Dialog>
    </div>
  );
}
