BEGIN;
SET LOCAL search_path=app;

-- Mesma borda de trim do ECMAScript e controles proibidos por plainText.
-- NUL e surrogates isolados já são recusados pela codificação UTF-8 do banco.
CREATE FUNCTION app.ticket_text_valid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
 SELECT value=btrim(value,
  U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
 AND value !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]';
$fn$;
REVOKE ALL ON FUNCTION app.ticket_text_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ticket_text_valid(text) TO meumimo_runtime;
ALTER TABLE "Redemption" ADD CONSTRAINT "Ticket_normalized_text_check"
 CHECK (app.ticket_text_valid("agreementText"));
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "Ticket_event_normalized_text_check"
 CHECK (app.ticket_text_valid(text));

COMMIT;
