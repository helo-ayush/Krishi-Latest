import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style headings
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-4 mb-2 text-foreground" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-3 mb-2 text-foreground" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-3 mb-2 text-foreground" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-base font-semibold mt-2 mb-1 text-foreground" {...props} />,
          // Style paragraphs
          p: ({ node, ...props }) => <p className="mb-2 leading-relaxed text-foreground" {...props} />,
          // Style lists - using better list styling
          ul: ({ node, ...props }) => (
            <ul className="list-disc mb-2 space-y-1.5 ml-6 my-2 text-foreground" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal mb-2 space-y-1.5 ml-6 my-2 text-foreground" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed text-foreground marker:text-primary" {...props} />
          ),
          // Style bold and italic
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic text-foreground" {...props} />,
          // Style code blocks
          code: ({ node, inline, ...props }: any) =>
            inline ? (
              <code
                className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono text-foreground"
                {...props}
              />
            ) : (
              <code
                className="block p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto mb-2 text-foreground"
                {...props}
              />
            ),
          pre: ({ node, ...props }: any) => (
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto mb-2" {...props} />
          ),
          // Style blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-primary/50 pl-4 italic my-2 text-muted-foreground bg-primary/5 py-2 rounded-r"
              {...props}
            />
          ),
          // Style links
          a: ({ node, ...props }) => (
            <a
              className="text-primary hover:text-primary/80 hover:underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          // Style horizontal rules
          hr: ({ node, ...props }) => (
            <hr className="my-4 border-t border-border" {...props} />
          ),
          // Style tables (if needed)
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-border rounded-lg" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-border px-4 py-2 bg-muted font-semibold text-left" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-border px-4 py-2" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

