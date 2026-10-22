export type Identity = Readonly<{
  userId: string;
  sessionId: string;
  assuranceLevel: 'aal1' | 'aal2';
}>;
