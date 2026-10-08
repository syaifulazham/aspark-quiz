/** Bare layout for printable documents: no admin chrome, so the browser can paginate cleanly. */
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {children}
    </div>
  );
}
