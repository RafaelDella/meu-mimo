-- Esquema Storage gerenciado pelo Supabase: não recriar com Prisma.
-- O broker separado é o único cliente deste bucket. Service role nunca vai ao Next.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'meumimo_t06_private_deny') THEN
    CREATE POLICY meumimo_t06_private_deny ON storage.objects AS RESTRICTIVE
      FOR ALL TO anon, authenticated
      USING (bucket_id <> 'meumimo-t06-private')
      WITH CHECK (bucket_id <> 'meumimo-t06-private');
  END IF;
END $$;
