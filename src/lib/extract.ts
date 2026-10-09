import 'server-only';

// Ambil teks dari PDF/DOCX supaya bisa dibaca agent lewat MCP.
export async function ekstrakTeks(buf: Buffer, namaFile: string): Promise<string | null> {
  try {
    const nama = namaFile.toLowerCase();
    if (nama.endsWith('.pdf')) {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: false });
      return text.map((t, i) => `--- Halaman ${i + 1} ---\n${t}`).join('\n\n');
    }
    if (nama.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value;
    }
  } catch (err) {
    console.error('Gagal mengekstrak teks', err);
  }
  return null;
}
