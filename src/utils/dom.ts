type Attributes = {
  [key: string]: string | number;
} & {
  data?: {
    [key: string]: string | number;
  }
};

/**
 * example usage:
 *
 *   const props = {className: 'btn', onclick: async (e) => alert('hi')};
 *   const btn = elem('button', props, ['download']);
 *   document.body.append(btn);
 *
 * @param {string} name
 * @param {HTMLElement.prototype} props
 * @param {Array<HTMLElement|string>} children
 * @return HTMLElement
 */
export const elem = <Name extends keyof HTMLElementTagNameMap>(
  name: Extract<Name, keyof HTMLElementTagNameMap>,
  attrs: Attributes = {}, // TODO optional
  children: Array<Node> | string = [], // TODO optional
): HTMLElementTagNameMap[Name] => {
  const {data, ...props} = attrs;
  const el = document.createElement(name);
  Object.assign(el, props);
  if (Array.isArray(children)) {
    el.append(...children);
  } else {
    const childType = typeof children;
    if (childType === 'number' || childType === 'string') {
      el.append(children);
    } else {
      console.error('call me');
    }
  }
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      el.dataset[key] = value as string;
    });
  }
  return el;
};

export const isValidURL = (url: URL) => {
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }
  if (!['', '443', '80'].includes(url.port)) {
    return false;
  }
  if (url.hostname === 'localhost') {
    return false;
  }
  const lastDot = url.hostname.lastIndexOf('.');
  if (lastDot < 1) {
    return false;
  }
  if (url.hostname.slice(lastDot) === '.local') {
    return false;
  }
  if (url.hostname.slice(lastDot + 1).match(/^[\d]+$/)) { // there should be no tld with numbers, possible ipv4
    return false;
  }
  if (url.hostname.includes(':')) { // possibly an ipv6 addr; certainly an invalid hostname
    return false;
  }
  return true;
}

/**
 * example usage:
 *
 * const [content, {firstLink}] = parseTextContent('Hi<br>click https://nostr.ch/');
 *
 * @param {string} content
 * @returns [Array<string | HTMLElement>, {firstLink: href}]
 */
export const parseTextContent = (
  content: string,
): [
  Array<string | HTMLAnchorElement | HTMLBRElement>,
  {firstLink: string | undefined},
] => {
  let firstLink: string | undefined;
  const parsedContent = content
    .trim()
    .replaceAll(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => {
      const words = line.split(/\s/);
      return words.map(word => {
        if (word.match(/^ln(tbs?|bcr?t?)[a-z0-9]+$/g)) {
          return elem('a', {
            href: `lightning:${word}`
          }, `lightning:${word.slice(0, 24)}…`);
        }
        if (!word.match(/^(https?:\/\/|www\.)\S*/)) {
          return word;
        }
        try {
          if (!word.startsWith('http')) {
            word = 'https://' + word;
          }
          const url = new URL(word);
          if (!isValidURL(url)) {
            return word;
          }
          firstLink = firstLink || url.href;
          return elem('a', {
            href: url.href,
            target: '_blank',
            rel: 'noopener noreferrer'
          }, url.href.slice(url.protocol.length + 2));
        } catch (err) {
          return word;
        }
      })
      .reduce((acc, word) => [...acc, word, ' '], []);
    })
    .reduce((acc, words) => [...acc, ...words, elem('br')], []);

  return [
    parsedContent,
    {firstLink}
  ];
};

/**
 * creates a small profile image
 * @param text to pass pubkey
 * @returns HTMLCanvasElement | null
 */
export const elemCanvas = (text: string) => {
  const canvas = elem('canvas', {
    height: 80,
    width: 80,
    data: {pubkey: text}
  });
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const color = `#${text.slice(0, 6)}`;
  context.fillStyle = color;
  context.fillRect(0, 0, 80, 80);
  context.fillStyle = '#111';
  context.fillRect(0, 50, 80, 32);
  context.font = 'bold 18px monospace';
  if (color === '#000000') {
    context.fillStyle = '#fff';
  }
  context.fillText(text.slice(0, 8), 2, 46);
  return canvas;
};

/**
 * creates a placeholder element that animates the height to 0
 * @param element to get the initial height from
 * @returns HTMLDivElement
 */
export const elemShrink = (el: HTMLElement) => {
  const height = el.style.height || el.getBoundingClientRect().height;
  const shrink = elem('div', {className: 'shrink-out'});
  shrink.style.height = `${height}px`;
  shrink.addEventListener('animationend', () => shrink.remove(), {once: true});
  return shrink;
};
