export type CsvRow = Record<string, string>;

export function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(values => {
    const item: CsvRow = {};
    headers.forEach((header, index) => {
      item[header] = (values[index] ?? '').trim();
    });
    return item;
  });
}
