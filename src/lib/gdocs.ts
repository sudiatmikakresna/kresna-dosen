// Utilitas link Google Docs: ambil ID, URL pratinjau, dan ekspor.
export function gdocsId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

export function gdocsPreviewUrl(id: string) {
  return `https://docs.google.com/document/d/${id}/preview`;
}

export function gdocsEditUrl(id: string) {
  return `https://docs.google.com/document/d/${id}/edit`;
}

async function ekspor(id: string, format: 'pdf' | 'txt') {
  const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=${format}`, {
    redirect: 'follow',
    cache: 'no-store',
  });
  const type = res.headers.get('content-type') ?? '';
  // Dokumen privat dialihkan ke halaman login Google (HTML), bukan berkas.
  if (!res.ok || type.includes('text/html')) return null;
  return res;
}

export async function eksporGdocs(id: string) {
  const [pdf, txt] = await Promise.all([ekspor(id, 'pdf'), ekspor(id, 'txt')]);
  if (!pdf || !txt) return null;
  return { pdf: Buffer.from(await pdf.arrayBuffer()), teks: await txt.text() };
}
