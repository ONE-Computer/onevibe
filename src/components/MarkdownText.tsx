import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

/** The assistant-ui renderer keeps provider Markdown readable and safe. */
export const MarkdownText = () => <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="aui-md" smooth />
