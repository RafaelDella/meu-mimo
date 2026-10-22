-- Prisma materializa @default(now()) durante create/upsert.
-- A aplicação pode inserir o instante, mas não a suspensão de segurança.
GRANT INSERT ("createdAt") ON app."Profile" TO meumimo_runtime;
