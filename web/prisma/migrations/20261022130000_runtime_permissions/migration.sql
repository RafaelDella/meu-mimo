-- O login e sua senha são provisionados fora da migração, somente no bootstrap.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'meumimo_runtime') THEN
    CREATE ROLE meumimo_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
DO $$ DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA app TO meumimo_runtime;
GRANT SELECT ON app."Profile", app."Store", app."Membership", app."AdminGrant",
  app."AuthSession", app."AuthRateBucket", app."SecurityAudit" TO meumimo_runtime;
GRANT INSERT ("id", "displayName") ON app."Profile" TO meumimo_runtime;
GRANT INSERT, UPDATE ON app."AuthSession", app."AuthRateBucket" TO meumimo_runtime;
GRANT INSERT ON app."SecurityAudit" TO meumimo_runtime;

-- Prisma conecta com papel próprio: RLS não recebe a identidade Supabase.
-- Os filtros de usuário/loja permanecem obrigatórios na autorização da aplicação.
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Profile', 'Store', 'Membership', 'AdminGrant',
      'AuthSession', 'AuthRateBucket', 'SecurityAudit'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY runtime_access ON app.%I TO meumimo_runtime USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
