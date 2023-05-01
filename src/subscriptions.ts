import {Event} from 'nostr-tools';
import {getReplyTo, hasEventTag, isMention} from './events';
import {sub, subOnce, unsubAll} from './relays';

type SubCallback = (
  event: Event,
  relay: string,
) => void;

/** subscribe to global feed */
export const sub24hFeed = (onEvent: SubCallback) => {
  unsubAll();
  const now = Math.floor(Date.now() * 0.001);
  const pubkeys = new Set<string>();
  const notes = new Set<string>();
  sub({ // get past events
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      notes.add(evt.id);
      onEvent(evt, relay);
    },
    filter: {
      kinds: [1],
      until: now,
      since: Math.floor(now - (24 * 60 * 60)),
      limit: 100,
    },
    unsub: true
  });

  setTimeout(() => {
    // get profile info
    sub({
      cb: onEvent,
      filter: {
        authors: Array.from(pubkeys),
        kinds: [0],
        limit: pubkeys.size,
      },
      unsub: true,
    });
    pubkeys.clear();

    // get reactions
    sub({
      cb: onEvent,
      filter: {
        '#e': Array.from(notes),
        kinds: [7],
        until: now,
        since: Math.floor(now - (24 * 60 * 60)),
      },
      unsub: true,
    });
    notes.clear();
  }, 2000);

  // subscribe to future notes, reactions and profile updates
  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
      subOnce({ // get profil data
        relay,
        cb: onEvent,
        filter: {
          authors: [evt.pubkey],
          kinds: [0],
          limit: 1,
        }
      });
    },
    filter: {
      kinds: [0, 1, 7],
      since: now,
    },
  });
};

/** subscribe to global feed */
// export const simpleSub24hFeed = (onEvent: SubCallback) => {
//   unsubAll();
//   sub({
//     cb: onEvent,
//     filter: {
//       kinds: [0, 1, 2, 7],
//       // until: Math.floor(Date.now() * 0.001),
//       since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
//       limit: 250,
//     }
//   });
// };

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
    },
    unsub: true,
  });

  const replies = new Set<string>();

  const onReply = (evt: Event, relay: string) => {
    replies.add(evt.id)
    onEvent(evt, relay);
    unsubAll();
    sub({
      cb: onEvent,
      filter: {
        '#e': Array.from(replies),
        kinds: [1, 7],
      },
      unsub: true,
    });
  };

  replies.add(eventId)
  sub({
    cb: onReply,
    filter: {
      '#e': [eventId],
      kinds: [1, 7],
    },
    unsub: true,
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
    cb: (evt, relay) => {
      const repliesTo = new Set<string>();
      if (evt.tags.some(hasEventTag) && !evt.tags.some(isMention)) {
        const note = getReplyTo(evt);
        if (note && !repliesTo.has(note)) {
          repliesTo.add(note);
          subOnce({
            relay,
            cb: onEvent,
            filter: {
              ids: [note],
              kinds: [1],
              limit: 1,
            }
          })
        }
      }
      onEvent(evt, relay);
    },
    filter: {
      authors: [pubkey],
      kinds: [1],
      limit: 50,
    }
  });
};
