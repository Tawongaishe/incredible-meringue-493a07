import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

// One store for everything. Keys:
//   meta/<id>          -> JSON { id, name, scriptTitle, chunks, pieceCount, studio, createdAt }
//   audio/<id>/<n>     -> raw recorded voice piece n (webm/opus or mp4, whatever the browser recorded)
// We keep the small voice pieces rather than the final WAV (which can be 10–30 MB);
// the app re-stitches them with the saved Studio mix (music, volumes, effect) when opened.
const store = () => getStore({ name: "inward-meditations", consistency: "strong" });

const ID_RE = /^[a-z0-9-]{8,64}$/i;
const MAX_PIECES = 20;
const MAX_PIECE_BYTES = 4 * 1024 * 1024; // stay under the function payload limit

const json = (body: unknown, status = 200) => Response.json(body, { status });
const bad = (msg: string, status = 400) => json({ error: msg }, status);

// Only keep the Studio fields the app knows about, with sane bounds.
function cleanStudio(input: any) {
  if (!input || typeof input !== "object") return null;
  const clamp = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
  };
  return {
    musicTrackId: String(input.musicTrackId || "pad").slice(0, 40),
    musicVolume: clamp(input.musicVolume, 0.5),
    voiceVolume: clamp(input.voiceVolume, 0.8),
    effectEnabled: input.effectEnabled !== false,
  };
}

export default async (req: Request, context: Context) => {
  // /api/meditations[/:id[/pieces/:n]]
  const parts = new URL(req.url).pathname.replace(/\/+$/, "").split("/").slice(3).map(decodeURIComponent);
  const id: string | undefined = context.params?.id ?? parts[0];
  const n: string | undefined = context.params?.n ?? (parts[1] === "pieces" ? parts[2] : undefined);
  if (parts.length > 3 || (parts.length >= 2 && parts[1] !== "pieces") || parts.length === 2) {
    return bad("Not found", 404);
  }
  const s = store();

  try {
    // ---- audio pieces: /api/meditations/:id/pieces/:n ----
    if (id && n !== undefined) {
      if (!ID_RE.test(id)) return bad("Bad id");
      const idx = Number(n);
      if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_PIECES) return bad("Bad piece number");
      const key = `audio/${id}/${idx}`;

      if (req.method === "PUT") {
        const buf = await req.arrayBuffer();
        if (buf.byteLength === 0) return bad("Empty audio");
        if (buf.byteLength > MAX_PIECE_BYTES) return bad("Piece too large", 413);
        const type = req.headers.get("content-type") || "application/octet-stream";
        await s.set(key, buf, { metadata: { type } });
        return json({ ok: true });
      }

      if (req.method === "GET") {
        const entry = await s.getWithMetadata(key, { type: "arrayBuffer" });
        if (!entry) return bad("Not found", 404);
        const type = (entry.metadata?.type as string) || "application/octet-stream";
        return new Response(entry.data, {
          headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" },
        });
      }
      return bad("Method not allowed", 405);
    }

    // ---- one meditation: /api/meditations/:id ----
    if (id) {
      if (!ID_RE.test(id)) return bad("Bad id");

      if (req.method === "GET") {
        const meta = await s.get(`meta/${id}`, { type: "json" });
        return meta ? json(meta) : bad("Not found", 404);
      }

      if (req.method === "PATCH") {
        const meta: any = await s.get(`meta/${id}`, { type: "json" });
        if (!meta) return bad("Not found", 404);
        const body = await req.json().catch(() => ({}));
        if (body.name !== undefined) {
          const name = String(body.name || "").trim().slice(0, 120);
          if (!name) return bad("Name is required");
          meta.name = name;
        }
        if (body.studio !== undefined) meta.studio = cleanStudio(body.studio);
        await s.setJSON(`meta/${id}`, meta);
        return json(meta);
      }

      if (req.method === "DELETE") {
        const { blobs } = await s.list({ prefix: `audio/${id}/` });
        await Promise.all(blobs.map((b) => s.delete(b.key)));
        await s.delete(`meta/${id}`);
        return json({ ok: true });
      }
      return bad("Method not allowed", 405);
    }

    // ---- collection: /api/meditations ----
    if (req.method === "GET") {
      const { blobs } = await s.list({ prefix: "meta/" });
      const metas = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
      const list = metas
        .filter(Boolean)
        .map((m: any) => ({ id: m.id, name: m.name, scriptTitle: m.scriptTitle, createdAt: m.createdAt, pieceCount: m.pieceCount }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json(list);
    }

    if (req.method === "POST") {
      // Client uploads the pieces first, then posts the metadata to "commit" the meditation.
      const body = await req.json().catch(() => null);
      if (!body) return bad("Expected JSON");
      const mid = String(body.id || "");
      if (!ID_RE.test(mid)) return bad("Bad id");
      const name = String(body.name || "").trim().slice(0, 120);
      if (!name) return bad("Name is required");
      const chunks = Array.isArray(body.chunks) ? body.chunks.map((c: unknown) => String(c)).slice(0, MAX_PIECES) : [];
      if (chunks.length === 0) return bad("No script");

      const { blobs } = await s.list({ prefix: `audio/${mid}/` });
      if (blobs.length < chunks.length) return bad("Some audio pieces are missing — try saving again");

      const meta = {
        id: mid,
        name,
        scriptTitle: body.scriptTitle ? String(body.scriptTitle).slice(0, 120) : null,
        chunks,
        pieceCount: chunks.length,
        studio: cleanStudio(body.studio),
        createdAt: new Date().toISOString(),
      };
      await s.setJSON(`meta/${mid}`, meta);
      return json(meta, 201);
    }

    return bad("Method not allowed", 405);
  } catch (err) {
    console.error(err);
    return bad("Server error: " + (err as Error).message, 500);
  }
};

export const config: Config = {
  path: ["/api/meditations", "/api/meditations/:id", "/api/meditations/:id/pieces/:n"],
};
