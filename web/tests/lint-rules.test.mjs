import test from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import quality from "../../eslint-rules/index.cjs";
import { verifyQualityRules } from "../../scripts/quality-rule-cases.mjs";

test("os mesmos casos de qualidade passam com o ESLint de web", () => {
  verifyQualityRules(RuleTester, quality);
});

test("limite de 350 linhas usa AST TypeScript e TSX reais", () => {
  const tester = new RuleTester({
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
  const declarations = (count) => Array.from(
    { length: count },
    (_, index) => `const value${index}: number = ${index};`,
  ).join("\n");
  tester.run("quality/max-lines: TypeScript", quality.rules["max-lines"], {
    valid: [
      {
        code: declarations(350),
        filename: "/repo/web/src/domain/values.ts",
        options: [{ max: 350, includeTests: true }],
      },
      {
        code: "interface Props { label: string }\nexport const Card = ({ label }: Props) => <p>{label}</p>;",
        filename: "/repo/web/src/components/card.tsx",
        options: [{ max: 350, includeTests: true }],
      },
    ],
    invalid: [
      ...["/repo/web/src/domain/values.ts", "/repo/web/tests/values.test.ts"].map((filename) => ({
        code: declarations(351),
        filename,
        options: [{ max: 350, includeTests: true }],
        errors: [{ messageId: "tooLong" }],
      })),
      {
        code: declarations(350) + "\nexport const Card = () => <p>Meu Mimo</p>;",
        filename: "/repo/web/src/components/card.tsx",
        options: [{ max: 350, includeTests: true }],
        errors: [{ messageId: "tooLong" }],
      },
    ],
  });
});

test("regras de apresentação aceitam servidor e rejeitam acesso direto em TSX", () => {
  const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
  const options = [{
    modules: ["@/server/db/client"],
    layers: ["/src/components/"],
    bindings: ["db"],
  }];
  tester.run("quality/no-direct-data-access: TypeScript", quality.rules["no-direct-data-access"], {
    valid: [{
      code: "import { db } from '@/server/db/client'; export const total: number = db.total;",
      filename: "/repo/web/src/server/summary.ts",
      options,
    }],
    invalid: [{
      code: "import { db } from '@/server/db/client'; const total: number = db.total; export const Card = () => <p>{total}</p>;",
      filename: "/repo/web/src/components/card.tsx",
      options,
      errors: [{ messageId: "forbidden" }],
    }],
  });
  tester.run("quality/no-direct-console: TypeScript", quality.rules["no-direct-console"], {
    valid: [{
      code: "const label: string = 'Meu Mimo'; logger.info(label);",
      filename: "/repo/web/src/components/message.ts",
    }],
    invalid: [{
      code: "const label: string = 'Meu Mimo'; console.log(label);",
      filename: "/repo/web/src/components/message.ts",
      errors: [{ messageId: "banned" }],
    }],
  });
});
