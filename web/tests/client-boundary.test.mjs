import test from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { clientBoundary } from "../eslint-rules/client-boundary.mjs";

const filename = "/repo/web/src/components/nested/card.tsx";
const forbidden = { messageId: "forbidden" };

test("fronteira de cliente verifica imports e exports em TS/TSX reais", () => {
  const tester = new RuleTester({
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
  tester.run("client-boundary", clientBoundary, {
    valid: [
      {
        name: "serviço de servidor pode importar seus adaptadores",
        code: "import { db } from './db/client'; import { readFile } from 'node:fs/promises';",
        filename: "/repo/web/src/server/service.ts",
      },
      {
        name: "Server Component pode importar módulo de servidor",
        code: "import { runtime } from '@/server/only'; export default function Page() { return <p>{runtime}</p>; }",
        filename: "/repo/web/src/app/page.tsx",
      },
      {
        name: "cliente mantém tipos e componentes públicos",
        code: "'use client'; import type { ReactNode } from 'react'; export const Card = ({ children }: { children: ReactNode }) => <p>{children}</p>;",
        filename,
      },
      {
        name: "nomes semelhantes e pastas locais não são src/server",
        code: "'use client'; import '@/server-tools'; import './server/public'; import '../../serverish/public';",
        filename,
      },
      {
        name: "importação dinâmica pública permanece permitida",
        code: "'use client'; export async function load() { return import('./card-view'); }",
        filename,
      },
      {
        name: "string fora do prólogo não cria um módulo cliente",
        code: "const label: string = 'Meu Mimo'; 'use client'; import '@/server/only';",
        filename,
      },
    ],
    invalid: [
      ...["node:fs/promises", "fs", "prisma", "@prisma/client", "@prisma/adapter-pg", "server-only", "@/server", "@/server/db/client", "../../server/db/client"].map((source) => ({
        name: `importação proibida: ${source}`,
        code: `'use client'; import value from '${source}'; export const Card = () => <p>{String(value)}</p>;`,
        filename,
        errors: [forbidden],
      })),
      {
        name: "caminho relativo Windows é normalizado",
        code: "'use client'; import { db } from '../../server/db/client';",
        filename: "C:\\repo\\web\\src\\components\\nested\\card.tsx",
        errors: [forbidden],
      },
      {
        name: "reexportação nomeada também é fronteira",
        code: "'use client'; export { db } from '@/server/db/client';",
        filename,
        errors: [forbidden],
      },
      {
        name: "reexportação geral também é fronteira",
        code: "'use client'; export * from '../../server/only';",
        filename,
        errors: [forbidden],
      },
      {
        name: "import type não libera referência ao servidor",
        code: "'use client'; import type { User } from '@/server/db/client';",
        filename,
        errors: [forbidden],
      },
      {
        name: "importação dinâmica literal é verificada",
        code: "'use client'; export const load = () => import('@/server/only');",
        filename,
        errors: [forbidden],
      },
      {
        name: "template literal estático é verificado",
        code: "'use client'; export const load = () => import(`node:fs`);",
        filename,
        errors: [forbidden],
      },
      {
        name: "require literal não contorna a fronteira",
        code: "'use client'; const storage = require('node:fs');",
        filename,
        errors: [forbidden],
      },
      {
        name: "prólogo com outra diretiva continua identificando cliente",
        code: "'use strict'; 'use client'; import '@/server/only';",
        filename,
        errors: [forbidden],
      },
    ],
  });
});
