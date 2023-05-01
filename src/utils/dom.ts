import {isNotNull} from './array';
import {isValidURL} from './url';

type DataAttributes = {
  data: {
    [key: string]: string | number;
  },
} & {
  dataset: never, // the dataset property itself is readonly
};

type Attributes<Type> = Partial<Type & DataAttributes>;

type Children = Array<HTMLElement | string | null> | HTMLElement | string | number | null;

/**
 * example usage:
 *
 *   const props = {className: 'btn', onclick: async (e) => alert('hi')};
 *   const btn = elem('button', props, ['download']);
 *   document.body.append(btn);
 *
 * @param {string} name
 * @param {HTMLElement.prototype} props
 * @param {Array<Node> | string | number} children
 * @return HTMLElement
 */
export const elem = <Name extends keyof HTMLElementTagNameMap>(
  name: Extract<Name, keyof HTMLElementTagNameMap>,
  attrs?: Attributes<HTMLElementTagNameMap[Name]>,
  children?: Children,
): HTMLElementTagNameMap[Name] => {
  const el = document.createElement(name);
  if (attrs) {
    const {data, ...props} = attrs;
    Object.assign(el, props);
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        el.dataset[key] = value as string;
      });
    }
  }
  if (children != null) {
    if (Array.isArray(children)) {
      el.append(...children.filter(isNotNull));
    } else {
      switch (typeof children) {
        case 'number':
          el.append(`${children}`);
          break;
        case 'string':
          el.append(children);
          break;
        default:
          if (children instanceof Element) {
            el.append(children);
            break;
          }
          console.error(`expected element, string or number but got ${typeof children}`, children);
      }
    }
  }
  return el;
};

/** freeze global page scrolling */
export const lockScroll = () => document.body.style.overflow = 'hidden';

/** free global page scrolling */
export const unlockScroll = () => document.body.style.removeProperty('overflow');

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


export const updateElemHeight = (
  el: HTMLInputElement | HTMLTextAreaElement
) => {
  el.style.removeProperty('height');
  if (el.value) {
    el.style.paddingBottom = '0';
    el.style.paddingTop = '0';
    el.style.height = el.scrollHeight + 'px';
    el.style.removeProperty('padding-bottom');
    el.style.removeProperty('padding-top');
  }
};

export const elemArticle = (
  content: Array<HTMLElement>,
  attrs: Attributes<HTMLElementTagNameMap['div']> = {},
) => {
  const className = attrs.className ? `mbox ${attrs.className}` : 'mbox';
  return elem('article', {...attrs, className}, content);
};
