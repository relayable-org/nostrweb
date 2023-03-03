import {Event} from 'nostr-tools';
import {sub, unsubAll} from './relays';

type SubCallback = (
  event: Event,
  relay: string,
) => void;

/** subscribe to global feed */
export const sub24hFeed = (onEvent: SubCallback) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      kinds: [0, 1, 2, 7],
      // until: Math.floor(Date.now() * 0.001),
      since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
      limit: 50,
    }
  });
};

/** subscribe to a note id (nip-19) */
export const subNote = (
  eventId: string,
  onEvent: SubCallback,
) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      ids: [eventId],
      kinds: [1],
      limit: 1,
    }
  });
  sub({
    cb: onEvent,
    filter: {
      '#e': [eventId],
      kinds: [1, 7],
    }
  });
};

/** subscribe to npub key (nip-19) */
export const subProfile = (
  pubkey: string,
  onEvent: SubCallback,
) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      authors: [pubkey],
      kinds: [0],
      limit: 1,
    }
  });
  // get notes for profile
  sub({
    cb: onEvent,
    filter: {
      authors: [pubkey],
      kinds: [1],
      limit: 50,
    }
  });
};
