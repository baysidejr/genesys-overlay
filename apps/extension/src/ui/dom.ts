type Child = Node | string | number | null | undefined | false;

type Props = {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
  [attr: `aria-${string}`]: string | undefined;
} & Record<string, unknown>;

/** Small element builder. Functions on `on*` props become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value as string;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in el && !key.includes("-")) {
      try {
        (el as unknown as Record<string, unknown>)[key] = value;
      } catch {
        // Read-only properties such as input.list only take the attribute.
        el.setAttribute(key, String(value));
      }
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGSVGElement;
}
