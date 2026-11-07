"use client";

/** Opens the browser's print screen, where "Save as PDF" makes the file to download or share. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary px-4 py-2">
      Download PDF
    </button>
  );
}
