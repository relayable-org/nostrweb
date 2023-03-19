import { elem } from './utils/dom';
import { getNoxyUrl } from './utils/url';

export const parseContent = (content: string) => {
  try {
    return JSON.parse(content);
  } catch(err) {
    console.warn(err, content);
    return null;
  }
}

type FetchItem = {
  href: string;
  id: string;
  relay: string;
};

type NoxyData = {
  title: string;
  descr: string;
  images: string[];
};

const fetchQue: Array<FetchItem> = [];

let fetchPending: (null | Promise<NoxyData>) = null;

const fetchNext = (
  href: string,
  id: string,
  relay: string,
) => {
  const noxy = getNoxyUrl('meta', href, id, relay);
  if (!noxy) {
    return false;
  }
  const previewId = noxy.searchParams.toString();
  if (fetchPending) {
    fetchQue.push({href, id, relay});
    return previewId;
  }
  fetchPending = fetch(noxy.href)
    .then(data => {
      if (data.status === 200) {
        return data.json();
      }
      // fetchQue.push({href, id, relay}); // could try one more time
      return Promise.reject(data);
    })
    .then(meta => {
      const container = document.getElementById(previewId);
      const content: Array<HTMLElement> = [];
      if (meta.images[0]) {
        const img = getNoxyUrl('data', meta.images[0], id, relay);
        img && content.push(
          elem('img', {
            className: 'preview-image',
            loading: 'lazy',
            src: img.href,
          })
        );
      }
      if (meta.title) {
        content.push(elem('h2', {className: 'preview-title'}, meta.title));
      }
      if (meta.descr) {
        content.push(elem('p', {className: 'preview-descr'}, meta.descr))
      }
      if (container && content.length) {
        container.append(elem('a', {href, rel: 'noopener noreferrer', target: '_blank'}, content));
        container.classList.add('preview-loaded');
      }
    })
    .finally(() => {
      fetchPending = null;
      if (fetchQue.length) {
        const {href, id, relay} = fetchQue.shift() as FetchItem;
        return fetchNext(href, id, relay);
      }
    })
    .catch(err => err.text && err.text())
    .then(errMsg => errMsg && console.warn(errMsg));

  return previewId;
};

export const linkPreview = (
  href: string,
  id: string,
  relay: string,
) => {
  if ((/\.(gif|jpe?g|png)$/i).test(href)) {
    const img = getNoxyUrl('data', href, id, relay);
    if (!img) {
      return null;
    }
    return elem('div', {},
      [elem('img', {
        className: 'preview-image-only',
        loading: 'lazy',
        src: img.href,
      })]
    );
  }
  const previewId = fetchNext(href, id, relay);
  if (!previewId) {
    return null;
  }
  return elem('div', {
    className: 'preview',
    id: previewId,
  });
};
