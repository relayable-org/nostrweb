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
