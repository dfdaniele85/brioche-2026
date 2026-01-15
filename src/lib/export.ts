export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/**
 * PDF “robusto”: usa la stampa del browser con CSS @media print.
 * L’utente poi sceglie “Salva come PDF”.
 */
export function exportPdfViaPrint(options: { title: string }): void {
  const prev = document.title;
  document.title = options.title;

  // Timeout per assicurare che il titolo/DOM siano aggiornati prima di print
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      document.title = prev;
    }, 200);
  }, 50);
}
