"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-gray-900 mb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-gray-900 mt-3 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-800 mt-2 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed mb-1.5 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-gray-500 not-italic text-xs">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="space-y-0.5 mb-2 ml-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-0.5 mb-2 ml-1 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed flex gap-1.5">
      <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }) => (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-l-3 border-emerald-500 rounded-r-lg px-3 py-2 my-2 text-sm">
      {children}
    </div>
  ),
  hr: () => (
    <hr className="border-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-2" />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-gray-200">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-emerald-50">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-gray-100">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-gray-50 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-semibold text-emerald-800 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 text-gray-700">{children}</td>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-emerald-600 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
      {children}
    </code>
  ),
};

interface MarkdownMessageProps {
  content: string;
}

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-report">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
