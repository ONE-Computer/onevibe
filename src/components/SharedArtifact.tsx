import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getSharedArtifact } from '../lib/api'

export const SharedArtifact = ({ shareId }: { shareId: string }) => {
  const [artifact, setArtifact] = useState<{ title: string; mode: string; createdAt: string } | null>(null)
  useEffect(() => { void getSharedArtifact(shareId).then(setArtifact) }, [shareId])
  return <main className="shared-view"><header><div><ShieldCheck size={16} /><strong>ONEVibe</strong><span>Wallet-approved read-only artifact</span></div><a href="/">Open ONEVibe</a></header>{artifact ? <><section><span>{artifact.mode} artifact</span><h1>{artifact.title}</h1><p>Shared {new Date(artifact.createdAt).toLocaleString()} through a separately approved capability link.</p></section><iframe title={artifact.title} sandbox="allow-scripts" src={`/api/shares/${shareId}/preview`} /></> : <div className="loading-state"><span className="loader" /> Loading shared artifact…</div>}</main>
}
