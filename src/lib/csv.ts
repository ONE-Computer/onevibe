export type ParsedCsv = { headers: string[]; rows: string[][]; rowCount: number; columnCount: number }

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvParseError'
  }
}

export const parseCsv = (source: string, limits: { maxRows?: number; maxColumns?: number } = {}): ParsedCsv => {
  const maxRows = limits.maxRows ?? 5_000
  const maxColumns = limits.maxColumns ?? 100
  if (!source.trim()) throw new CsvParseError('CSV is empty')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false
  const pushField = () => {
    row.push(field)
    field = ''
    closedQuote = false
    if (row.length > maxColumns) throw new CsvParseError(`CSV exceeds the ${maxColumns}-column limit`)
  }
  const pushRow = () => {
    if (row.length === 0 && field === '') return
    pushField()
    rows.push(row)
    row = []
    if (rows.length > maxRows) throw new CsvParseError(`CSV exceeds the ${maxRows}-row limit`)
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else field += character
      continue
    }
    if (closedQuote) {
      if (character === ',') {
        pushField()
        continue
      }
      if (character === '\n' || character === '\r') {
        if (character === '\r' && source[index + 1] === '\n') index += 1
        pushRow()
        continue
      }
      if (character === ' ' || character === '\t') {
        field += character
        continue
      }
      throw new CsvParseError('Unexpected content after a closing quote')
    }
    if (character === '"' && field.length === 0) {
      quoted = true
      continue
    }
    if (character === ',') {
      pushField()
      continue
    }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      pushRow()
      continue
    }
    field += character
  }
  if (quoted) throw new CsvParseError('CSV contains an unterminated quoted field')
  if (field.length > 0 || row.length > 0 || closedQuote) pushRow()
  if (rows.length < 2) throw new CsvParseError('CSV requires a header and at least one data row')
  const headers = rows[0]!
  if (headers.length === 0 || headers.every((header) => !header.trim())) throw new CsvParseError('CSV header is empty')
  const dataRows = rows.slice(1)
  if (dataRows.some((dataRow) => dataRow.length !== headers.length)) throw new CsvParseError('CSV rows have inconsistent column counts')
  return { headers, rows: dataRows, rowCount: dataRows.length, columnCount: headers.length }
}
