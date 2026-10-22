// Autoverificação das regras locais com o ESLint instalado na raiz.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RuleTester } from "eslint";
import { verifyQualityRules } from "./quality-rule-cases.mjs";

const target = process.argv[2] ?? "./eslint-rules/index.cjs";
const plugin = (await import(pathToFileURL(path.resolve(target)).href)).default;
verifyQualityRules(RuleTester, plugin);
