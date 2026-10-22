import { builtinModules } from "node:module";
import path from "node:path";

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

function staticSource(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function isPrivateSource(source, filename) {
  if (source.startsWith("node:") || builtins.has(source)) return true;
  if (source === "prisma" || source.startsWith("prisma/")) return true;
  if (source.startsWith("@prisma/")) return true;
  if (source === "server-only" || source.startsWith("server-only/")) return true;
  if (source === "@/server" || source.startsWith("@/server/")) return true;
  if (!source.startsWith(".")) return false;

  const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), source));
  return /(?:^|\/)src\/server(?:\/|$)/.test(target);
}

export const clientBoundary = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      forbidden: "Módulos cliente não podem importar {{source}}; use serviços no servidor.",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replaceAll("\\", "/");
    let client = false;

    function checkSource(node, reference) {
      if (!client) return;
      const source = staticSource(reference);
      if (source && isPrivateSource(source, filename)) {
        context.report({ node, messageId: "forbidden", data: { source } });
      }
    }

    return {
      Program(node) {
        for (const statement of node.body) {
          if (statement.type !== "ExpressionStatement" || !statement.directive) break;
          if (statement.directive === "use client") client = true;
        }
      },
      ImportDeclaration(node) {
        checkSource(node, node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node, node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node, node.source);
      },
      ImportExpression(node) {
        checkSource(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          checkSource(node, node.arguments[0]);
        }
      },
    };
  },
};
