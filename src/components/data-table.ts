/** Filter already-loaded CSV cells only; no connector, mutation, or query engine. */
export const filterDataRows = (rows: string[][], query: string) => {
  const needle = query.trim().toLocaleLowerCase()
  const body = rows.slice(1)
  return needle ? body.filter((row) => row.some((cell) => cell.toLocaleLowerCase().includes(needle))) : body
}
