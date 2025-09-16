import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <p className="mb-2 leading-relaxed" {...props} />,
        ul: ({ node, ...props }) => <ul className="mb-2 list-disc pl-5" {...props} />,
        ol: ({ node, ...props }) => <ol className="mb-2 list-decimal pl-5" {...props} />,
        li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        code: ({ inline, className, ...props }) => (
          <code
            className={
              'rounded bg-accent px-1 py-0.5 font-mono text-xs ' + (className ?? '')
            }
            {...props}
          />
        ),
        pre: ({ node, ...props }) => (
          <pre className="mb-2 max-w-full overflow-auto rounded-md bg-accent p-2" {...props} />
        ),
        h1: (p) => <h1 className="mb-2 text-xl font-semibold" {...p} />,
        h2: (p) => <h2 className="mb-2 text-lg font-semibold" {...p} />,
        h3: (p) => <h3 className="mb-2 text-base font-semibold" {...p} />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

