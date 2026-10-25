import { MimoSticker } from '@/components/ui/mimo-page';
import { MimoIcon } from '@/components/ui/mimo-icon';

export function AccountWelcome() {
  return <header className="account-header">
    <div className="account-welcome-copy">
      <p className="mimo-eyebrow">Um cantinho só de vocês</p>
      <h1>Seu cantinho de carinho</h1>
      <p>Pequenas conquistas, mimos especiais e mais motivos para celebrar juntos.</p>
    </div>
    <div className="account-collage" aria-hidden="true">
      <div className="account-photo"><MimoSticker kind="kitten" /><span>feito para vocês <MimoIcon name="heart" /></span></div>
      <MimoSticker kind="gift" className="account-gift" />
      <MimoSticker kind="envelope" className="account-envelope" />
      <MimoIcon name="sparkle" className="account-sparkle" />
    </div>
    <ul className="account-perks" aria-label="No Meu Mimo">
      <li><MimoIcon name="activities" />Celebrem conquistas</li>
      <li><MimoIcon name="gift" />Troquem carinho</li>
      <li><MimoIcon name="people" />Do jeitinho de vocês</li>
    </ul>
  </header>;
}
