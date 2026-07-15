import { Clock3, ExternalLink, Fingerprint, LockKeyhole, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Task } from '../types'

export const ApprovalCard = ({ approval }: { approval: NonNullable<Task['approval']> }) => (
  <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="approval-card">
    <div className="approval-icon"><ShieldAlert size={18} /></div>
    <div className="approval-body">
      <div className="approval-kicker">OpenVTC approval required</div>
      <h3>Publish this workspace preview</h3>
      <p>The request is waiting in a separate VTI Wallet. ONEVibe cannot approve its own action.</p>
      <div className="approval-facts">
        <span><Fingerprint size={13} /> Intent bound</span><span><Clock3 size={13} /> 15 minute expiry</span><span><LockKeyhole size={13} /> Wallet key custody</span>
      </div>
      <a href={approval.walletUrl} className="wallet-button">Open VTI Wallet <ExternalLink size={14} /></a>
    </div>
    <span className="pending-badge">Pending</span>
  </motion.article>
)
