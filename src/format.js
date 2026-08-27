export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function humanReport(report) {
  return `${Object.entries(report).map(([key, value]) => {
    const rendered = Array.isArray(value) ? (value.length ? value.join(', ') : 'none')
      : value && typeof value === 'object' ? canonicalJson(value) : String(value);
    return `${key.replaceAll('_', ' ')}: ${rendered}`;
  }).join('\n')}\n`;
}

export function parseFormatArgs(args) {
  if (args.length === 0) return { format: 'json' };
  if (args.length === 2 && args[0] === '--format' && ['json', 'human'].includes(args[1])) return { format: args[1] };
  return null;
}

export function writeReport(stream, report, format) {
  stream.write(format === 'human' ? humanReport(report) : canonicalJson(report));
}
