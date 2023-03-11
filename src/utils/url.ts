export const getHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch(err) {
    return err;
  }
};

export const isHttpUrl = (url: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch (err) {
    return false;
  }
};

export const isWssUrl = (url: string) => {
  try {
    return 'wss:' === new URL(url).protocol;
  } catch (err) {
    return false;
  }
};

export const getNoxyUrl = (
  type: 'data' | 'meta',
  url: string,
  id: string,
  relay: string,
) => {
  if (!isHttpUrl(url)) {
    return false;
  }
  const link = new URL(`https://noxy.nostr.ch/${type}`);
  link.searchParams.set('id', id);
  link.searchParams.set('relay', relay);
  link.searchParams.set('url', url);
  return link;
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
};
