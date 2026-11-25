export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

export function setOptions(select, options, selected) {
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  select.value = options.some(([value]) => value === selected) ? selected : options[0]?.[0] ?? '';
}
