import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getFile } from '../lib/api'
import { parseValidationReport, type ValidationReport } from './validation-report'

export const ValidationReportPane = ({ taskId }: { taskId: string }) => {
  const [report, setReport] = useState<ValidationReport | undefined>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    void getFile(taskId, 'validation-report.json').then((file) => { if (active) setReport(parseValidationReport(file.content)) }).catch(() => { if (active) setReport(undefined) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [taskId])
  if (loading) return <div className="workspace-placeholder"><ClipboardCheck size={20} /><strong>Loading validation report</strong><span>Reading the recorded static contract checks.</span></div>
  if (!report) return <div className="workspace-placeholder"><AlertTriangle size={20} /><strong>Validation report unavailable</strong><span>Open the Files tab to inspect `validation-report.json`.</span></div>
  const failed = report.checks.filter((check) => check.status === 'failed').length
  return <section className="validation-pane"><header><div><ClipboardCheck size={18} /><div><span>Artifact quality gate</span><strong>{report.passed ? 'Static contract passed' : 'Static contract needs review'}</strong></div></div><em>{new Date(report.checkedAt).toLocaleString()}</em></header><div className="validation-summary"><article><span>Checks</span><strong>{report.checks.length}</strong></article><article><span>Passed</span><strong>{report.checks.filter((check) => check.status === 'passed').length}</strong></article><article className={failed ? 'failed' : ''}><span>Failed</span><strong>{failed}</strong></article></div><div className="validation-checks">{report.checks.map((check) => <article className={check.status} key={check.id}>{check.status === 'passed' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<div><strong>{check.id.replaceAll(':', ' · ')}</strong><span>{check.detail}</span></div><em>{check.status}</em></article>)}</div><footer><ShieldCheck size={13} /><p>{report.limitation}</p></footer></section>
}
