// Supabase Edge Function: scrape-images
// Runs server-side — no CORS issues, no proxy needed.
// Fetches a URL and extracts all product image URLs from the HTML.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { url } = await req.json() as { url: string };
    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch the page as a real browser would
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Site returned ${res.status}` }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const html = await res.text();
    const base = new URL(url);

    const images: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    // Clean up scraped product titles — strip site names, pack counts, keep size/weight
    const cleanLabel = (raw: string, fallbackSrc: string): string => {
      let s = raw.trim();
      if (!s) {
        s = fallbackSrc.split("/").pop()?.split("?")[0]?.replace(/[-_]/g, " ").replace(/\.\w+$/, "") ?? "";
      }
      // Decode HTML entities
      s = s
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      // Strip site name after separators: " - Caribshopper", " | Site", " – "
      s = s.replace(/\s*[-–|]\s*[A-Z][^|–\-]{2,}$/, "").trim();
      // Strip pack/count quantities inside parens/brackets — but NOT size/weight
      // Matches: (3 Pack), (6 Pack), (3 or 6 Pack), (12 Count), (Pack of 4), (Case of 24)
      // Does NOT match: (330ml), (12oz), (1.4oz), (750ml)
      s = s.replace(/\s*\(\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\)/gi, "").trim();
      s = s.replace(/\s*\[\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\]/gi, "").trim();
      // Strip bare "X Pack" / "Pack of X" not in parens
      s = s.replace(/\s*[-,]?\s*\d+\s*(?:pack|count|ct|pk)\b/gi, "").trim();
      s = s.replace(/\s*[-,]?\s*pack\s+of\s+\d+\b/gi, "").trim();
      // Strip empty parens/brackets left behind: "()", "[]", "( )"
      s = s.replace(/\s*[(\[]\s*[)\]]\s*/g, "").trim();
      // Collapse spaces
      s = s.replace(/\s+/g, " ").trim();
      return s || "Untitled";
    };

    const addImage = (src: string, label: string) => {
      if (!src || src.startsWith("data:")) return;
      try {
        // Resolve relative URLs
        let resolved = new URL(src, base).href;
        // Strip query params but keep the path
        const u = new URL(resolved);
        // Only keep image file extensions
        if (!/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u.pathname)) return;
        // Strip Shopify size suffixes like _200x200 or _grande
        u.pathname = u.pathname.replace(/_(?:\d+x\d*|grande|medium|small|thumb|compact|large|master)(\.\w+)$/i, "$1");
        resolved = u.origin + u.pathname;
        if (seen.has(resolved)) return;
        seen.add(resolved);
        images.push({ url: resolved, label: cleanLabel(label, resolved) });
      } catch { /* skip */ }
    };

    // ── 1. Extract from embedded JSON (Shopify, WooCommerce, etc.) ──
    // Shopify stores all product data in window.Shopify or __st JSON blobs
    const jsonMatches = html.matchAll(/https?:\/\/[^\s"'\\]+\.(?:jpg|jpeg|png|webp|gif|avif)[^\s"'\\]*/gi);
    for (const match of jsonMatches) {
      let src = match[0].replace(/\\u002F/g, "/").replace(/\\/g, "");
      // Remove trailing punctuation
      src = src.replace(/[,;)\]}>]+$/, "");
      addImage(src, "");
    }

    // ── 2. Parse HTML img tags ──
    const imgRegex = /<img[^>]+>/gi;
    const attrRegex = /(?:src|data-src|data-lazy-src|data-original|data-srcset|srcset)\s*=\s*["']([^"']+)["']/i;
    const altRegex = /alt\s*=\s*["']([^"']*)["']/i;

    for (const imgTag of html.matchAll(imgRegex)) {
      const tag = imgTag[0];
      const srcMatch = tag.match(attrRegex);
      const altMatch = tag.match(altRegex);
      if (!srcMatch) continue;
      // srcset: take the last (highest res) entry
      let src = srcMatch[1];
      if (src.includes(",")) {
        src = src.split(",").pop()?.trim().split(" ")[0] ?? src;
      }
      addImage(src, altMatch?.[1] ?? "");
    }

    // ── 3. og:image / twitter:image meta tags ──
    const metaRegex = /<meta[^>]+(?:og:image|twitter:image)[^>]+>/gi;
    const contentRegex = /content\s*=\s*["']([^"']+)["']/i;
    for (const metaTag of html.matchAll(metaRegex)) {
      const contentMatch = metaTag[0].match(contentRegex);
      if (contentMatch) addImage(contentMatch[1], "");
    }

    return new Response(JSON.stringify({ images, count: images.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
