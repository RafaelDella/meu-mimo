import Image from 'next/image';
import { MimoIcon } from './mimo-icon';

export type PointsSummaryProps = {
  storeName: string;
  available: number | string;
  pending: number | string;
  compact?: boolean;
};

const points = new Intl.NumberFormat('pt-BR');

export function PointsSummary({ storeName, available, pending, compact = false }: PointsSummaryProps) {
  return (
    <section className={`ui-points${compact ? ' ui-points-compact' : ''}`} aria-label="Seu potinho de pontos">
      <p className="ui-points-store">{storeName}</p>
      <div className="ui-points-collage">
        <div>
          <h3 className="ui-points-title"><MimoIcon name="heart" />Seu potinho de pontos</h3>
          <dl>
            <div className="ui-points-available">
              <dt>Disponíveis</dt>
              <dd><strong>{points.format(typeof available === 'string' ? BigInt(available) : available)}</strong> pontos</dd>
            </div>
            <div className="ui-points-pending">
              <dt>Em análise</dt>
              <dd><strong>{points.format(typeof pending === 'string' ? BigInt(pending) : pending)}</strong> pontos</dd>
            </div>
          </dl>
        </div>
        <Image className="ui-points-kitten" src="/assets/mimo-kitten.png" alt="" aria-hidden="true"
          width={1312} height={1199} sizes="(max-width: 480px) 112px, 152px" />
      </div>
      <p className="ui-points-note">Os pontos em análise ainda não entram no seu saldo disponível.</p>
    </section>
  );
}
