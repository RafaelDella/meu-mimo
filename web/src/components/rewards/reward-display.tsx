import Link from 'next/link';
import Image from 'next/image';
import type { RewardAvailability, RewardFields, RewardView } from '@/contracts/rewards';
import { points } from '@/components/activities/format';
import { rewardPath } from './transport';
import styles from './rewards.module.css';

export function RewardIllustration({ sticker }: { sticker: RewardFields['sticker'] }) {
  return <Image className={styles.sticker} src={`/assets/${sticker}.svg`} alt="" aria-hidden="true" width={96} height={96} />;
}
export function RewardRule({ reward }: { reward: RewardFields }) {
  return <><p><strong>{points(reward.cost)} pontos</strong> · Uma unidade por ticket</p>
    <p>{reward.stock === null ? 'Estoque ilimitado' : reward.stock === 0 ? 'Esgotado' : `${points(reward.stock)} ${reward.stock === 1 ? 'unidade disponível' : 'unidades disponíveis'}`}</p>
    {!reward.available && <p>Indisponível para novos resgates</p>}</>;
}
export function RewardAvailabilityText({ value, storeId }: { value: RewardAvailability | null; storeId: string }) {
  if (!value) return null;
  return <div><p role="status">{value.eligible ? 'Já pode ser seu' : value.reason === 'INSUFFICIENT_POINTS' ? `Faltam ${points(value.shortfall)} pontos para este mimo.` :
    value.reason === 'SOLD_OUT' ? 'Este mimo está esgotado.' : value.reason === 'ARCHIVED' ? 'Este mimo foi arquivado.' :
      value.reason === 'UNAVAILABLE' ? 'Este mimo está indisponível.' : value.reason === 'STORE_PLATFORM_PAUSED' ? 'Novos resgates estão pausados pela plataforma. Os tickets já emitidos continuam acessíveis.' : value.reason === 'STORE_PAUSED' ? 'Os resgates estão suspensos enquanto a loja está pausada.' :
        value.reason === 'MEMBERSHIP_CLOSED' ? 'Sua participação está encerrada. Seu histórico continua acessível.' : 'Esta loja está encerrada. Os tickets anteriores continuam acessíveis.'}</p>
    {value.reason === 'INSUFFICIENT_POINTS' && <Link className="stores-link" href={`/lojas/${storeId}/atividades`}>Ver atividades para juntar pontos</Link>}</div>;
}
export function RewardCard({ reward, merchant, preview = false }: { reward: RewardFields & Partial<RewardView>; merchant: boolean; preview?: boolean }) {
  return <article className={styles.card}><RewardIllustration sticker={reward.sticker} />
    <h3>{reward.name || 'Nome do mimo'}</h3>{reward.category && <p>{reward.category}</p>}<RewardRule reward={reward} />
    {reward.archivedAt && <p>Arquivado</p>}{reward.note && <p className={styles.text}>{reward.note}</p>}
    {!merchant && <RewardAvailabilityText value={reward.availability ?? null} storeId={reward.storeId ?? ''} />}
    {!preview && reward.id && reward.storeId && <Link className="stores-link" href={rewardPath(reward.storeId, reward.id)}>
      {merchant ? 'Gerenciar mimo' : 'Ver mimo'}<span className={styles.srOnly}>: {reward.name}</span></Link>}</article>;
}
export function RewardPreview({ reward }: { reward: RewardFields }) {
  return <section aria-label="Prévia do mimo"><h3>Prévia do card e do vale</h3><p>Esta prévia não salva o cadastro nem emite um ticket.</p>
    <div className={styles.preview}><RewardCard reward={reward} merchant preview /><article className={styles.ticket}>
      <p>Vale mimo · Prévia</p><h3>{reward.name || 'Nome do mimo'}</h3><p>{points(Number.isFinite(reward.cost) ? reward.cost : 0)} pontos</p>
      <p className={styles.text}>{reward.description}</p>{reward.note && <p className={styles.text}>{reward.note}</p>}
      {reward.instructions && <p className={styles.text}>{reward.instructions}</p>}</article></div></section>;
}
