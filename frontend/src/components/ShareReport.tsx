"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { canonicalSiteUrl } from "@/lib/seo";

function stripMarkdownForShare(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\|[^\n]+\|/g, (match) => {
      const cols = match.split("|").filter(Boolean).map((c) => c.trim());
      return cols.join(" | ");
    })
    .replace(/^[\s]*[-─━=_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateForWhatsApp(text: string, maxLen = 2000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n\n... [Full report on MedSign]";
}

export default function ShareReport({
  content,
  conversationId,
  variant = "full",
}: {
  content: string;
  conversationId?: string | null;
  variant?: "full" | "compact" | "inline";
}) {
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [pendingShare, setPendingShare] = useState<"whatsapp" | "link" | null>(null);

  const cleanText = stripMarkdownForShare(content);

  function handleCopy() {
    navigator.clipboard?.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function requestWhatsAppShare() {
    setPendingShare("whatsapp");
  }

  function openWhatsApp() {
    const siteLink = canonicalSiteUrl ? `\n${canonicalSiteUrl}` : "";
    const msg = truncateForWhatsApp(
      `${cleanText}\n\n---\nAI-generated care summary — not medical advice or a diagnosis.${siteLink}`
    );
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MedSign Health Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; font-size: 14px; line-height: 1.6; }
          h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.5em; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
          th { background: #f8f8f8; font-weight: 600; }
          .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { color: #10b981; font-size: 20px; margin: 0; }
          .header p { color: #888; font-size: 12px; margin: 4px 0 0; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; color: #aaa; font-size: 11px; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MedSign Health Report</h1>
          <p>AI-generated care summary — not medical advice or a diagnosis</p>
        </div>
        <div>${content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\n\n/g, "</p><p>")
          .replace(/\n/g, "<br>")
          .replace(/\|([^\n]+)\|/g, (match) => {
            const cells = match.split("|").filter(Boolean).map((c) => c.trim());
            if (cells.every((c) => /^[-:\s]+$/.test(c))) return "";
            const tag = cells.some((c) => /medicine|morning|afternoon/i.test(c)) ? "th" : "td";
            return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
          })
        }</div>
        <div class="footer">
          <p>AI-generated care summary</p>
          <p>This summary is not medical advice or a diagnosis. Review it with a licensed healthcare professional.</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  }

  function requestShareLink() {
    if (shareLink) {
      navigator.clipboard?.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    if (!conversationId) return;
    setPendingShare("link");
  }

  async function createShareLink() {
    if (!conversationId) return;
    setLoadingLink(true);
    try {
      const resp = await apiFetch<{ share_url: string }>(
        `/api/v1/history/${conversationId}/share?hours=48`,
        { method: "POST" }
      );
      setShareLink(resp.share_url);
      navigator.clipboard?.writeText(resp.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback to copy
      handleCopy();
    } finally {
      setLoadingLink(false);
    }
  }

  function confirmExternalShare() {
    const destination = pendingShare;
    if (!destination) return;
    setPendingShare(null);

    if (destination === "whatsapp") {
      openWhatsApp();
      return;
    }

    void createShareLink();
  }

  const shareConfirmation = pendingShare ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="share-confirmation-title" aria-describedby="share-confirmation-description">
      <div className="w-full max-w-sm rounded-2xl border border-cyan-100 bg-white p-5 shadow-2xl">
        <p id="share-confirmation-title" className="text-sm font-bold text-slate-900">
          Share health information?
        </p>
        <p id="share-confirmation-description" className="mt-2 text-xs leading-relaxed text-slate-600">
          {pendingShare === "whatsapp"
            ? "This will open WhatsApp with your health summary. Review the recipient and the content before sending."
            : "This will create a shareable link to your health summary. Anyone you send the link to may be able to view it."}
        </p>
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          Only share health information with people you trust.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingShare(null)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmExternalShare}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-700"
          >
            {pendingShare === "whatsapp" ? "Open WhatsApp" : "Create share link"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (variant === "inline") {
    return (
      <>
        <div className="flex items-center gap-1">
          <button onClick={requestWhatsAppShare} className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 transition-all" title="Share on WhatsApp">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </button>
          <button onClick={handlePrint} className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all" title="Download PDF">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
        {shareConfirmation}
      </>
    );
  }

  if (variant === "compact") {
    return (
      <>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={requestWhatsAppShare} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-lg hover:bg-green-100 transition-all">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          WhatsApp
        </button>
        <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 text-[11px] font-semibold rounded-lg hover:bg-gray-100 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF
        </button>
        <button onClick={handleCopy} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 text-[11px] font-semibold rounded-lg hover:bg-gray-100 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {shareConfirmation}
      </>
    );
  }

  // Full variant — shown after assessment completes
  return (
    <>
    <div className="warm-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-sm">
          <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Share Your Report</p>
          <p className="text-[10px] text-gray-400">Send to your doctor or save for records</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={requestWhatsAppShare}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 text-xs font-semibold rounded-xl hover:bg-green-100 transition-all border border-green-100"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Share on WhatsApp
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl hover:bg-blue-100 transition-all border border-blue-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download PDF
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-all border border-gray-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {copied ? "Copied!" : "Copy Text"}
        </button>

        {conversationId && (
          <button
            onClick={requestShareLink}
            disabled={loadingLink}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 text-purple-700 text-xs font-semibold rounded-xl hover:bg-purple-100 transition-all border border-purple-100 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {loadingLink ? "Creating..." : shareLink ? "Link Copied!" : "Share Link"}
          </button>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        External sharing includes an AI-generated-summary notice
      </p>
    </div>
    {shareConfirmation}
    </>
  );
}
