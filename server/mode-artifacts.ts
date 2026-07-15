import PptxGenJS from 'pptxgenjs'
import type { TaskStore } from './store.js'
import type { Task } from './types.js'

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const shell = (title: string, body: string, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>:root{font-family:Inter,system-ui;background:#090b0a;color:#f3f6f4}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 75% 10%,#143523,transparent 35%),#090b0a}main{width:min(1060px,92vw);margin:auto;padding:56px 0}.eyebrow{font:11px ui-monospace;color:#42db82;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(42px,7vw,82px);line-height:.94;letter-spacing:-.06em;margin:20px 0}p{color:#9aa59e;line-height:1.65}.card{border:1px solid #29332d;background:#101411;border-radius:14px;padding:22px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:30px}button{border:1px solid #375241;background:#15251b;color:#a5e3bd;border-radius:8px;padding:9px 12px;cursor:pointer}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`

const slides = [
  ['A governed place for capable agents', 'ONEVibe pairs an agent workspace with ONEComputer isolation and OpenVTC approvals.'],
  ['The enterprise tension', 'Teams want agent speed without giving every model ambient access to corporate systems.'],
  ['One task, one boundary', 'Each assignment receives a visible workspace, explicit tools, and durable evidence.'],
  ['Policy follows intent', 'Actions are evaluated against company policy before tools or data are reached.'],
  ['Approval leaves the workload', 'Sensitive actions move to a separate VTI Wallet instead of trusting the browser session.'],
  ['Source remains portable', 'Teams retain generated source, version history, and evidence rather than a provider-only artifact.'],
  ['Built for agent choice', 'Claude, Codex, and future runtimes can share the same enterprise control plane.'],
  ['The next milestone', 'Run the complete admin-to-employee-to-wallet journey on ONEComputer infrastructure.'],
]

const writeSlides = async (task: Task, store: TaskStore) => {
  const moduleValue: unknown = PptxGenJS
  const PptxConstructor = typeof moduleValue === 'function' ? moduleValue : (moduleValue as { default: unknown }).default
  // PptxGenJS has different default-import shapes under native Node and TSX/Vitest transforms; both expose this constructor.
  // @ts-expect-error The runtime shape is verified in both unit and live API integration tests.
  const deck = new PptxConstructor()
  deck.layout = 'LAYOUT_WIDE'
  deck.author = 'ONEVibe'
  deck.subject = task.prompt
  for (const [title, summary] of slides) {
    const slide = deck.addSlide()
    slide.background = { color: '090B0A' }
    slide.addShape(deck.ShapeType.rect, { x: 0.45, y: 0.45, w: 0.08, h: 0.35, fill: { color: '38DC7D' }, line: { color: '38DC7D' } })
    slide.addText('ONEVIBE / GOVERNED AGENT WORKSPACE', { x: 0.7, y: 0.43, w: 6, h: 0.3, fontFace: 'Aptos Mono', fontSize: 9, color: '38DC7D', charSpacing: 1.5 })
    slide.addText(title, { x: 0.7, y: 1.55, w: 11.8, h: 1.5, fontFace: 'Aptos Display', fontSize: 34, bold: true, color: 'F3F6F4', breakLine: false, margin: 0 })
    slide.addText(summary, { x: 0.72, y: 3.25, w: 9.7, h: 1.1, fontFace: 'Aptos', fontSize: 17, color: '9AA59E', margin: 0, breakLine: false })
    slide.addText(`${slides.indexOf(slides.find((item) => item[0] === title)!) + 1}`.padStart(2, '0'), { x: 11.9, y: 6.75, w: 0.7, h: 0.3, fontFace: 'Aptos Mono', fontSize: 9, color: '647068', align: 'right' })
  }
  const bytes = await deck.write({ outputType: 'uint8array', compression: true })
  if (!(bytes instanceof Uint8Array)) throw new Error('PPTX generator returned an unexpected output type')
  await store.writeWorkspaceBytes(task.id, 'deck.pptx', bytes)
  await store.writeWorkspaceFile(task.id, 'outline.json', `${JSON.stringify(slides.map(([title, summary], index) => ({ number: index + 1, title, summary })), null, 2)}\n`)
  await store.writeWorkspaceFile(task.id, 'speaker-notes.md', slides.map(([title, summary], index) => `## ${index + 1}. ${title}\n\n${summary}\n`).join('\n'))
  const cards = slides.map(([title, summary], index) => `<article class="card slide" data-slide="${index}"><div class="eyebrow">Slide ${index + 1} / ${slides.length}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></article>`).join('')
  await store.writeWorkspaceFile(task.id, 'index.html', shell('ONEVibe deck', `<div id="deck">${cards}</div><p><button id="previous">Previous</button> <button id="next">Next</button></p>`, `const slides=[...document.querySelectorAll('.slide')];let active=0;function show(){slides.forEach((s,i)=>s.hidden=i!==active)};previous.onclick=()=>{active=(active-1+slides.length)%slides.length;show()};next.onclick=()=>{active=(active+1)%slides.length;show()};show()`))
  return ['index.html', 'outline.json', 'speaker-notes.md', 'deck.pptx']
}

const writeScaffold = async (task: Task, store: TaskStore) => {
  const files: Record<string, string> = {
    'app/package.json': `${JSON.stringify({ private: true, scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }, dependencies: { react: '^19.2.7', 'react-dom': '^19.2.7' }, devDependencies: { '@types/react': '^19.2.17', '@types/react-dom': '^19.2.3', '@vitejs/plugin-react': '^6.0.3', typescript: '~6.0.2', vite: '^8.1.1' } }, null, 2)}\n`,
    'app/vite.config.ts': "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n",
    'app/tsconfig.json': `${JSON.stringify({ compilerOptions: { target: 'ES2022', jsx: 'react-jsx', strict: true, module: 'ESNext', moduleResolution: 'Bundler' }, include: ['src'] }, null, 2)}\n`,
    'app/src/main.tsx': "import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './styles.css'\nimport App from './App'\ncreateRoot(document.getElementById('root')!).render(<App />)\n",
    'app/src/App.tsx': `import { useState } from 'react'\nexport default function App(){const [approved,setApproved]=useState(false);return <main><h1>${task.title.replaceAll('`', '')}</h1><p>Generated inside ONEVibe.</p><button onClick={()=>setApproved(!approved)}>{approved?'Approved demo':'Request approval demo'}</button></main>}\n`,
    'app/src/styles.css': ':root{font-family:system-ui;color:#eef3ef;background:#090b0a}body{margin:0}main{padding:10vw}button{padding:10px}\n',
    'app/index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
    'app/.gitignore': 'node_modules\ndist\n.env*\n',
    'app/.prettierrc': '{"semi":false,"singleQuote":true}\n',
  }
  for (const [file, content] of Object.entries(files)) await store.writeWorkspaceFile(task.id, file, content)
  return Object.keys(files)
}

export const writeModeArtifacts = async (task: Task, store: TaskStore) => {
  if (task.mode === 'slides') return writeSlides(task, store)
  if (task.mode === 'document') {
    const document = `# ${task.title}\n\n## Purpose\n\n${task.prompt}\n\n## Executive summary\n\nThis portable document was drafted in a governed ONEVibe workspace. It separates the requested outcome from the operating boundary: actions that can change external state remain subject to policy and, where required, a separate wallet approval.\n\n## Recommended next steps\n\n1. Review the substantive content with the accountable owner.\n2. Validate source material and assumptions before external distribution.\n3. Request an external approval for any publication or connector write.\n\n## Provenance\n\nThis file is exported with the task evidence manifest.\n`
    await store.writeWorkspaceFile(task.id, 'document.md', document)
    await store.writeWorkspaceFile(task.id, 'document.json', `${JSON.stringify({ title: task.title, format: 'markdown', generatedBy: 'onevibe', requiresReview: true }, null, 2)}\n`)
    await store.writeWorkspaceFile(task.id, 'index.html', shell(task.title, `<div class="eyebrow">Governed document</div><h1>${escapeHtml(task.title)}</h1><div class="card"><strong>Executive summary</strong><p>${escapeHtml(task.prompt)}</p></div><div class="grid"><article class="card"><strong>Portable</strong><p>Markdown source is ready for review, editing, and export.</p></article><article class="card"><strong>Accountable</strong><p>External distribution remains subject to the configured approval policy.</p></article></div>`))
    return ['index.html', 'document.md', 'document.json']
  }
  if (task.mode === 'research') {
    await store.writeWorkspaceFile(task.id, 'report.md', `# ${task.title}\n\n## Research question\n\n${task.prompt}\n\n## Findings\n\nThis local demo establishes the evidence-oriented artifact contract. Native Claude mode performs the substantive research.\n\n## Limitations\n\nNo external sources were accessed by the deterministic demo runtime.\n`)
    await store.writeWorkspaceFile(task.id, 'sources.json', '[]\n')
    await store.writeWorkspaceFile(task.id, 'index.html', shell(task.title, `<div class="eyebrow">Evidence-backed research</div><h1>${escapeHtml(task.title)}</h1><div class="grid"><article class="card"><strong>Question</strong><p>${escapeHtml(task.prompt)}</p></article><article class="card"><strong>Boundary</strong><p>No external sources were accessed in demo mode.</p></article></div>`))
    return ['index.html', 'report.md', 'sources.json']
  }
  if (task.mode === 'data') {
    const rows = [['Stage', 'Workspaces'], ['Requested', '120'], ['Policy checked', '112'], ['Sandbox ready', '97'], ['Delivered', '84']]
    const csv = rows.map((row) => row.join(',')).join('\n') + '\n'
    const data = rows.slice(1).map(([label, value]) => ({ label, value: Number(value) }))
    const bars = data.map((item) => `<div class="bar"><span>${escapeHtml(item.label)}</span><i style="width:${item.value / 1.2}%"></i><b>${item.value}</b></div>`).join('')
    await store.writeWorkspaceFile(task.id, 'data.csv', csv)
    await store.writeWorkspaceFile(task.id, 'analysis.json', `${JSON.stringify({ metric: 'workspace progression', data, limitation: 'Deterministic sample data; connect an approved source for real analysis.' }, null, 2)}\n`)
    await store.writeWorkspaceFile(task.id, 'index.html', shell(task.title, `<style>.chart{margin-top:34px;padding:25px;border:1px solid #29332d;background:#101411}.chart h2{margin:0 0 22px;font-size:18px}.bar{display:grid;grid-template-columns:110px minmax(30px,1fr) 35px;gap:12px;align-items:center;margin:13px 0;color:#aeb8b1;font-size:13px}.bar i{height:11px;background:linear-gradient(90deg,#36dc7d,#91edb6);border-radius:99px}.bar b{color:#eaf2ec}.note{font-size:13px}</style><div class="eyebrow">Evidence-aware data story</div><h1>${escapeHtml(task.title)}</h1><p>${escapeHtml(task.prompt)}</p><section class="chart"><h2>Workspace progression</h2>${bars}</section><p class="note">Sample data only. The data.csv and analysis.json files make assumptions inspectable before any decision is made.</p>`))
    return ['index.html', 'data.csv', 'analysis.json']
  }
  if (task.mode === 'design') {
    await store.writeWorkspaceFile(task.id, 'ideas.md', '# Design directions\n\n1. Secure Signal — evidence-forward enterprise interface.\n2. Quiet Infrastructure — calm, sparse operational canvas.\n3. Human Checkpoint — approval and intent as the visual center.\n\nSelected: Secure Signal.\n')
    await store.writeWorkspaceFile(task.id, 'design-tokens.json', `${JSON.stringify({ color: { background: '#090b0a', verified: '#38dc7d', pending: '#f1b84b' }, radius: { panel: 14 }, motion: { standard: 180 } }, null, 2)}\n`)
    return ['ideas.md', 'design-tokens.json']
  }
  if (task.mode === 'website' || task.mode === 'app' || task.mode === 'game') return writeScaffold(task, store)
  return []
}
