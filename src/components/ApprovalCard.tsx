import { CheckCircle2, Clock3, ExternalLink, Fingerprint, LockKeyhole, ShieldAlert, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Task } from '../types'

export const ApprovalCard = ({ approval }: { approval: NonNullable<Task['approval']> }) => {
  const pending = approval.state === 'pending'
  const action = approval.action.replaceAll('_', ' ')
  const heading = approval.state === 'approved' ? `${action} approved externally` : approval.state === 'denied' ? `${action} was denied externally` : approval.state === 'expired' ? `${action} request expired` : `Approve ${action}`
  const description = approval.state === 'approved' ? `The separate VTI Wallet approved this request${approval.receipt ? ` as ${approval.receipt.signer}` : ''}. ONEVibe records the receipt but never holds approval authority.` : approval.state === 'denied' ? `The separate VTI Wallet denied this request${approval.receipt ? ` as ${approval.receipt.signer}` : ''}. No browser decision was accepted.` : approval.state === 'expired' ? 'The external approval window closed before a decision. Create a new request if the action is still required.' : 'The request is waiting in a separate VTI Wallet. ONEVibe cannot approve its own action.'
  return <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`approval-card secure-signal-cut ${approval.state}`}>
    <div className="approval-icon">{approval.state === 'approved' ? <CheckCircle2 size={18} /> : approval.state === 'denied' || approval.state === 'expired' ? <XCircle size={18} /> : <ShieldAlert size={18} />}</div>
    <div className="approval-body">
      <div className="approval-kicker">{pending ? 'OpenVTC approval required' : 'OpenVTC wallet receipt'}</div>
      <h3>{heading}</h3>
      <p>{description}</p>
      <div className="approval-facts">
        <span><Fingerprint size={13} /> {approval.intentHash ? `Intent ${approval.intentHash.slice(0, 8)}` : 'Renewal required'}</span><span><Clock3 size={13} /> {pending ? '15 minute expiry' : approval.receipt ? new Date(approval.receipt.decidedAt).toLocaleString() : 'Decision window closed'}</span><span><LockKeyhole size={13} /> Wallet key custody</span>
      </div>
      {pending && <a href={approval.walletUrl} className="wallet-button">Open VTI Wallet <ExternalLink size={14} /></a>}
      {pending && <details className="wallet-handoff"><summary>What happens in the external wallet?</summary><div className="wallet-phone" aria-label="Illustration of the separate VTI Wallet approval flow"><span>VTI WALLET</span><strong>Review intent</strong><p>{action}</p><i><Fingerprint size={13} /> Sign with wallet key</i><small>This preview is informational. The decision happens only in the separate wallet.</small></div></details>}
    </div>
    <span className="pending-badge">{approval.state}</span>
  </motion.article>
}
