import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { Check, Code2, Eye, ListFilter, Loader2, AlertCircle, Braces } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { parseQuestions } from '@/lib/question-schema'

const theme = EditorView.theme({
  '&': { color: '#b8cbe7', backgroundColor: '#0e1723', fontSize: '12px' },
  '.cm-content': { fontFamily: '"DM Mono", monospace', padding: '12px 0', caretColor: '#f1b087' },
  '.cm-line': { padding: '0 16px', lineHeight: '1.8' },
  '.cm-gutters': { backgroundColor: '#0d1420', color: '#536d90', borderRight: '1px solid #26364c' },
  '.cm-activeLineGutter': { backgroundColor: '#1d2d42', color: '#adc9ee' },
  '.cm-activeLine': { backgroundColor: '#23385144' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#42679766' },
  '.cm-tooltip': { backgroundColor: '#1b2c43', border: '1px solid #3d5a7f', color: '#bbd5f8' },
}, { dark: true })
const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.propertyName, color: '#bba4f4' }, { tag: tags.string, color: '#97cfae' },
  { tag: tags.number, color: '#e9b982' }, { tag: tags.bool, color: '#83c9e8' },
  { tag: tags.null, color: '#eea4b5' }, { tag: tags.punctuation, color: '#7c96b7' },
]))
const extensions = [json(), theme, highlight, EditorView.lineWrapping, lintGutter(), linter(jsonParseLinter(), { delay: 150 }), EditorView.contentAttributes.of({ 'aria-label': 'Question schema JSON', role: 'textbox', 'aria-multiline': 'true' })]

export function SchemaEditor({ value, onChange, onSave, saving, serverError }: { value: string; onChange: (value: string) => void; onSave: () => void; saving: boolean; serverError: string }) {
  const parsed = useMemo(() => parseQuestions(value), [value])
  return <><div className="schema-editor-layout"><div className="code-column"><div className="editor-panel-title"><Code2 size={14} /><span>SCHEMA.JSON</span><Badge variant="outline">JSON</Badge></div><CodeMirror className="schema-code-editor" value={value} onChange={onChange} extensions={extensions} theme={theme} height="100%" basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }} />
    <div className={`schema-validation ${parsed.issues.length ? 'invalid' : 'valid'}`} role={parsed.issues.length ? 'alert' : 'status'}>{parsed.issues.length ? <><AlertCircle size={14} /><div>{parsed.issues.map((issue, i) => <p key={i}><strong>{issue.path || 'Schema'}</strong>{issue.message}</p>)}</div></> : <><Check size={14} />Valid schema · {Object.keys(parsed.questions!).length} questions</>}</div></div>
    <section className="schema-live-preview" aria-label="Live schema preview"><div className="editor-panel-title"><Eye size={14} /><span>LIVE PREVIEW</span><span className="preview-dot" /></div><div className="preview-content">{parsed.questions ? Object.entries(parsed.questions).map(([id, question]) => <div className="preview-question" key={id}><div className="preview-question-heading"><strong>{id}</strong><Badge variant="outline">{question.type}</Badge></div><p>{question.instructions}</p>{question.type === 'choice' ? Object.entries(question.criteria).map(([option, criteria], i) => <div className="preview-option" key={option}><span>{String(i + 1).padStart(2, '0')}</span><div><strong>{option}</strong><p>{criteria}</p></div></div>) : question.type === 'noul' ? <div className="preview-boolean"><span>Yes <small>0–100%</small></span><span>No <small>0–100%</small></span></div> : <div className="preview-score">{question.criteria.map((level, i) => <div key={i}><span>{i}</span><p>{level}</p></div>)}</div>}</div>) : <div className="preview-invalid"><Braces size={27} /><strong>Preview paused</strong><p>Fix the schema errors to render the updated questions.</p></div>}</div></section></div>
    {serverError && <p className="dialog-error" role="alert">{serverError}</p>}<div className="schema-editor-footer"><span><ListFilter size={13} />choice · noul · score</span><Button variant="outline" disabled={!parsed.questions} onClick={() => { if (parsed.questions) onChange(JSON.stringify(parsed.questions, null, 2)) }}>Format JSON</Button><Button disabled={!parsed.questions || saving} onClick={onSave}>{saving ? <Loader2 className="spin" /> : <Check size={14} />}Apply schema</Button></div></>
}
