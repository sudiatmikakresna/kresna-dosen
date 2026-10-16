import { jsonCors, opsi } from '@/lib/cors';
import { metadataServer } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** Metadata server otorisasi (RFC 8414) untuk connector Claude. */
export const GET = () => jsonCors(metadataServer());
export const OPTIONS = opsi;
