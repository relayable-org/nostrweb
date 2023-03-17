import {Event, signEvent, UnsignedEvent} from 'nostr-tools';
import {powEvent} from './system';
import {publish} from './relays';
import {hasEventTag} from './events';
import {getViewElem} from './view';
import {config} from './settings';

type ReactionMap = {
  [eventId: string]: Array<Event>
};

const reactionMap: ReactionMap = {};

export const getReactions = (eventId: string) => reactionMap[eventId] || [];

export const getReactionContents = (eventId: string) => {
  return reactionMap[eventId]?.map(({content}) => content) || [];
};

export const handleReaction = (
  evt: Event,
  relay: string,
) => {
  // last id is the note that is being reacted to https://github.com/nostr-protocol/nips/blob/master/25.md
  const lastEventTag = evt.tags.filter(hasEventTag).at(-1);
  if (!lastEventTag || !evt.content.length) {
    // ignore reactions with no content
    return;
  }
  const [, eventId] = lastEventTag;
  if (reactionMap[eventId]) {
    if (reactionMap[eventId].find(reaction => reaction.id === evt.id)) {
      // already received this reaction from a different relay
      return;
    }
    reactionMap[eventId] = [evt, ...(reactionMap[eventId])];
  } else {
    reactionMap[eventId] = [evt];
  }
  const article = getViewElem(eventId);
  if (article) {
    const button = article.querySelector('button[name="star"]') as HTMLButtonElement;
    const reactions = button.querySelector('[data-reactions]') as HTMLElement;
    reactions.textContent = `${reactionMap[eventId].length || ''}`;
    if (evt.pubkey === config.pubkey) {
      const star = button.querySelector('img[src*="star"]');
      star?.setAttribute('src', '/assets/star-fill.svg');
      star?.setAttribute('title', getReactionContents(eventId).join(' '));
    }
  }
};

const upvote = async (
  eventId: string,
  evt: UnsignedEvent,
) => {
  const article = getViewElem(eventId);
  const reactionBtn = article.querySelector('button[name="star"]') as HTMLButtonElement;
  const statusElem = article.querySelector('[data-reactions]') as HTMLElement;
  reactionBtn.disabled = true;
  const newReaction = await powEvent(evt, {
    difficulty: config.difficulty,
    statusElem,
    timeout: config.timeout,
  }).catch(console.warn);
  if (!newReaction) {
    statusElem.textContent = `${getReactions(eventId)?.length}`;
    reactionBtn.disabled = false;
    return;
  }
  const privatekey = localStorage.getItem('private_key');
  if (!privatekey) {
    statusElem.textContent = 'no private key to sign';
    statusElem.hidden = false;
    return;
  }
  const sig = signEvent(newReaction, privatekey);
  // TODO: validateEvent
  if (sig) {
    statusElem.textContent = 'publishing…';
    publish({...newReaction, sig}, (relay, error) => {
      if (error) {
        return console.error(error, relay);
      }
      console.info(`event published by ${relay}`);
    });
    reactionBtn.disabled = false;
  }
};

export const handleUpvote = (evt: Event) => {
  const tags = [
    ...evt.tags
      .filter(tag => ['e', 'p'].includes(tag[0])) // take e and p tags from event
      .map(([a, b]) => [a, b]), // drop optional (nip-10) relay and marker fields, TODO: use relay?
    ['e', evt.id], ['p', evt.pubkey], // last e and p tag is the id and pubkey of the note being reacted to (nip-25)
  ];
  upvote(evt.id, {
    kind: 7,
    pubkey: config.pubkey,
    content: '+',
    tags,
    created_at: Math.floor(Date.now() * 0.001),
  });
};
