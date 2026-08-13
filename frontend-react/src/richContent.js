// Sanitização leve do HTML rico que o OpenProject guarda em comment.raw
// (CKEditor) — mistura HTML de verdade (parágrafos, <img>, <mention>...)
// com o texto puro do comentário. Sem lib externa: usa o próprio DOMParser
// do navegador e uma whitelist de tags/atributos.

const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "CODE", "PRE",
  "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "SPAN", "DIV", "H1", "H2", "H3",
  "H4", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "HR", "MENTION",
]);

const ALLOWED_ATTRS = {
  A: ["href", "title"],
  IMG: ["src", "alt", "title", "width", "height"],
  MENTION: ["data-id", "data-type", "data-text"],
};

function isSafeUrl(value) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("/") ||
    v.startsWith("data:image/")
  );
}

function sanitizeNode(node) {
  // Texto puro passa direto.
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName;
  if (!ALLOWED_TAGS.has(tag)) {
    // Tag não permitida (script, style, iframe...) — mantém só o conteúdo
    // textual dos filhos, descarta a tag em si.
    const frag = document.createDocumentFragment();
    node.childNodes.forEach((child) => {
      const clean = sanitizeNode(child);
      if (clean) frag.appendChild(clean);
    });
    return frag;
  }

  const el = document.createElement(tag === "MENTION" ? "span" : tag.toLowerCase());
  if (tag === "MENTION") {
    el.className = "mention-chip";
    const name = node.getAttribute("data-text") || node.textContent || "@?";
    el.textContent = name.startsWith("@") ? name : `@${name}`;
    return el;
  }

  const allowedAttrs = ALLOWED_ATTRS[tag] || [];
  allowedAttrs.forEach((attr) => {
    const value = node.getAttribute(attr);
    if (!value) return;
    if ((attr === "href" || attr === "src") && !isSafeUrl(value)) return;
    el.setAttribute(attr, value);
  });
  if (tag === "A") {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  }
  if (tag === "IMG") {
    el.className = "activity-inline-image";
    el.loading = "lazy";
  }

  node.childNodes.forEach((child) => {
    const clean = sanitizeNode(child);
    if (clean) el.appendChild(clean);
  });
  return el;
}

/** Sanitiza HTML bruto do OpenProject e devolve markup seguro pra dangerouslySetInnerHTML. */
export function sanitizeRichHtml(rawHtml) {
  if (!rawHtml) return "";
  const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
  const root = doc.body.firstChild;
  const container = document.createElement("div");
  root.childNodes.forEach((child) => {
    const clean = sanitizeNode(child);
    if (clean) container.appendChild(clean);
  });
  return container.innerHTML;
}
