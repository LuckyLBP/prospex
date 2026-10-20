import { toText } from "@/lib/enrich/extract";

/**
 * Ritas sidan av JavaScript? Då är HTML-koden en tom skiss (`<div id="root">`) och sidfoten, med byråns kredit, finns
 * inte i det vi hämtar. Ren.
 */
export function isClientRendered(html: string | null | undefined): boolean {
  if (!html) return false;
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const visible = toText(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")).trim();
  return visible.length < 120 && /<script\b/i.test(html);
}
