export type PointsSummaryProps = {
  storeName: string;
  available: number;
  pending: number;
};

const points = new Intl.NumberFormat('pt-BR');

export function PointsSummary({ storeName, available, pending }: PointsSummaryProps) {
  return (
    <section className="ui-points" aria-label="Seu potinho de pontos">
      <p className="ui-points-store">{storeName}</p>
      <h3>Seu potinho de pontos</h3>
      <dl>
        <div className="ui-points-available">
          <dt>Disponíveis</dt>
          <dd><strong>{points.format(available)}</strong> pontos</dd>
        </div>
        <div className="ui-points-pending">
          <dt>Em análise</dt>
          <dd><strong>{points.format(pending)}</strong> pontos</dd>
        </div>
      </dl>
      <p className="ui-points-note">Os pontos em análise ainda não entram no seu saldo disponível.</p>
    </section>
  );
}
