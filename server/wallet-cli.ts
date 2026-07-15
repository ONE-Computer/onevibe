const apiUrl = process.env.ONEVIBE_API_URL ?? 'http://127.0.0.1:4311'
const token = process.env.ONEVIBE_WALLET_TOKEN
const [command = 'list', approvalId] = process.argv.slice(2)

if (!token) throw new Error('Set ONEVIBE_WALLET_TOKEN before using the separate wallet CLI')

const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json() as unknown
  if (!response.ok) throw new Error(`Wallet API returned HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

if (command === 'list') {
  console.log(JSON.stringify(await request('/api/wallet/approvals'), null, 2))
} else if ((command === 'approve' || command === 'deny') && approvalId) {
  const signer = process.env.ONEVIBE_WALLET_SIGNER ?? 'local-vti-wallet'
  console.log(JSON.stringify(await request(`/api/wallet/approvals/${encodeURIComponent(approvalId)}/decision`, {
    method: 'POST', body: JSON.stringify({ decision: command === 'approve' ? 'approved' : 'denied', signer }),
  }), null, 2))
} else {
  throw new Error('Usage: npm run wallet -- list | approve <approval-id> | deny <approval-id>')
}
