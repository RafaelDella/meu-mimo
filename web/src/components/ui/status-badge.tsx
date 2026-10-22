export type StatusBadgeProps = {
  tone: 'success' | 'pending' | 'error' | 'info';
  text: string;
};

const symbols = {
  success: '✓',
  pending: '◷',
  error: '!',
  info: 'i',
};

export function StatusBadge({ tone, text }: StatusBadgeProps) {
  return (
    <span className={`ui-status ui-status-${tone}`}>
      <span aria-hidden="true">{symbols[tone]}</span>
      <span>{text}</span>
    </span>
  );
}
