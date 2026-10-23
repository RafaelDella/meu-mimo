const names = ['Error', 'AssertionError', 'TypeError', 'RangeError', 'SyntaxError', 'AggregateError'];
const operators = ['==', '===', '!=', '!==', 'strictEqual', 'notStrictEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'fail'];

/** Keep code and repository locations only; messages and assertion values may be private. */
export function privateDiagnostic(error, depth = 0) {
  const frames = [];
  for (const line of String(error?.stack ?? '').split(/\r?\n/).filter(value => /^\s+at /.test(value))) {
    const found = /[\\/]web[\\/]((?:scripts|tests|src)[\\/][a-zA-Z0-9_.\\/-]+):(\d+):(\d+)/.exec(line);
    if (found && !found[1].split(/[\\/]/).includes('..') && frames.length < 12) {
      frames.push({ file: found[1].replaceAll('\\', '/'), line: Number(found[2]), column: Number(found[3]) });
    }
  }
  return { name: names.includes(error?.name) ? error.name : 'Error',
    ...(typeof error?.code === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(error.code) ? { code: error.code } : {}),
    ...(operators.includes(error?.operator) ? { operator: error.operator } : {}), frames,
    ...(depth < 2 && error instanceof AggregateError ? { causes: error.errors.slice(0, 3).map(value => privateDiagnostic(value, depth + 1)) } : {}) };
}
