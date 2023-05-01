import {Event, nip19} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';
import {elem} from './utils/dom';
import {bounce} from './utils/time';
import {isWssUrl} from './utils/url';
import {sub24hFeed, subNote, subProfile} from './subscriptions'
import {getReplyTo, hasEventTag, isMention, sortByCreatedAt, sortEventCreatedAt} from './events';
import {clearView, getViewContent, getViewElem, getViewOptions, setViewElem, view} from './view';
import {closeSettingsView, config, toggleSettingsView} from './settings';
import {handleReaction, handleUpvote} from './reactions';
import {closePublishView, openWriteInput, togglePublishView} from './write';
import {handleMetadata, renderProfile} from './profiles';
import {EventWithNip19, EventWithNip19AndReplyTo, textNoteList, replyList} from './notes';
import {createTextNote, renderRecommendServer} from './ui';

// curl -H 'accept: application/nostr+json' https://relay.nostr.ch/

type EventRelayMap = {
  [eventId: string]: string[];
};
const eventRelayMap: EventRelayMap = {}; // eventId: [relay1, relay2]

const renderNote = (
  evt: EventWithNip19,
  i: number,
  sortedFeeds: EventWithNip19[],
) => {
  if (getViewElem(evt.id)) { // note already in view
    return;
  }
  const article = createTextNote(evt, eventRelayMap[evt.id][0]);
  if (i === 0) {
    getViewContent().append(article);
  } else {
    getViewElem(sortedFeeds[i - 1].id).before(article);
  }
  setViewElem(evt.id, article);
};

const hasEnoughPOW = (
  [tag, , commitment]: string[],
  eventId: string
) => {
  return tag === 'nonce' && Number(commitment) >= config.filterDifficulty && zeroLeadingBitsCount(eventId) >= config.filterDifficulty;
};

const renderFeed = bounce(() => {
  const view = getViewOptions();
  switch (view.type) {
    case 'note':
      textNoteList
        .concat(replyList)
        .filter(note => note.id === view.id)
        .forEach(renderNote);
      break;
    case 'profile':
      const isEvent = <T>(evt?: T): evt is T => evt !== undefined;
      [
        ...textNoteList
          .filter(note => note.pubkey === view.id),
        ...replyList.filter(reply => reply.pubkey === view.id)
          .map(reply => textNoteList.find(note => note.id === reply.replyTo) || replyList.find(note => note.id === reply.replyTo) )
          .filter(isEvent)
      ]
        .sort(sortByCreatedAt)
        .reverse()
        .forEach(renderNote); // render in-reply-to

      renderProfile(view.id);
      break;
    case 'feed':
      const now = Math.floor(Date.now() * 0.001);
      textNoteList
        .filter(note => {
          // dont render notes from the future
          if (note.created_at > now) return false;
          // if difficulty filter is configured dont render notes with too little pow
          return !config.filterDifficulty || note.tags.some(tag => hasEnoughPOW(tag, note.id))
        })
        .sort(sortByCreatedAt)
        .reverse()
        .forEach(renderNote);
      break;
  }
}, 17); // (16.666 rounded, an arbitrary value to limit updates to max 60x per s)

const renderReply = (evt: EventWithNip19AndReplyTo) => {
  const parent = getViewElem(evt.replyTo);
  if (!parent) { // root article has not been rendered
    return;
  }
  let replyContainer = parent.querySelector('.mbox-replies');
  if (!replyContainer) {
    replyContainer = elem('div', {className: 'mbox-replies'});
    parent.append(replyContainer);
    parent.classList.add('mbox-has-replies');
  }
  const reply = createTextNote(evt, eventRelayMap[evt.id][0]);
  replyContainer.append(reply);
  setViewElem(evt.id, reply);
};

const handleReply = (evt: EventWithNip19, relay: string) => {
  if (
    getViewElem(evt.id) // already rendered probably received from another relay
    || evt.tags.some(isMention) // ignore mentions for now
  ) {
    return;
  }
  const replyTo = getReplyTo(evt);
  if (!replyTo) {
    console.warn('expected to find reply-to-event-id', evt);
    return;
  }
  const evtWithReplyTo = {replyTo, ...evt};
  replyList.push(evtWithReplyTo);
  renderReply(evtWithReplyTo);
};

const handleTextNote = (evt: Event, relay: string) => {
  if (evt.content.startsWith('vmess://') && !evt.content.includes(' ')) {
    console.info('drop VMESS encrypted message');
    return;
  }
  if (eventRelayMap[evt.id]) {
    eventRelayMap[evt.id] = [...(eventRelayMap[evt.id]), relay]; // TODO: just push?
  } else {
    eventRelayMap[evt.id] = [relay];
    const evtWithNip19 = {
      nip19: {
        note: nip19.noteEncode(evt.id),
        npub: nip19.npubEncode(evt.pubkey),
      },
      ...evt,
    };
    if (evt.tags.some(hasEventTag)) {
      handleReply(evtWithNip19, relay);
    } else {
      textNoteList.push(evtWithNip19);
    }
  }
  if (!getViewElem(evt.id)) {
    renderFeed();
  }
};

config.rerenderFeed = () => {
  clearView();
  renderFeed();
};

const handleRecommendServer = (evt: Event, relay: string) => {
  if (getViewElem(evt.id) || !isWssUrl(evt.content)) {
    return;
  }
  const art = renderRecommendServer(evt, relay);
  if (textNoteList.length < 2) {
    getViewContent().append(art);
  } else {
    const closestTextNotes = textNoteList
      // TODO: prob change to hasEnoughPOW
      .filter(note => !config.filterDifficulty || note.tags.some(([tag, , commitment]) => tag === 'nonce' && Number(commitment) >= config.filterDifficulty))
      .sort(sortEventCreatedAt(evt.created_at));
    getViewElem(closestTextNotes[0].id)?.after(art); // TODO: note might not be in the dom yet, recommendedServers could be controlled by renderFeed
  }
  setViewElem(evt.id, art);
};

const onEvent = (evt: Event, relay: string) => {
  switch (evt.kind) {
    case 0:
      handleMetadata(evt, relay);
      break;
    case 1:
      handleTextNote(evt, relay);
      break;
    case 2:
      handleRecommendServer(evt, relay);
      break;
    case 3:
      // handleContactList(evt, relay);
      break;
    case 7:
      handleReaction(evt, relay);
    default:
      // console.log(`TODO: add support for event kind ${evt.kind}`/*, evt*/)
  }
};

// subscribe and change view
const route = (path: string) => {
  if (path === '/') {
    sub24hFeed(onEvent);
    view('/', {type: 'feed'});
  } else if (path.length === 64 && path.match(/^\/[0-9a-z]+$/)) {
    const {type, data} = nip19.decode(path.slice(1));
    if (typeof data !== 'string') {
      console.warn('nip19 ProfilePointer, EventPointer and AddressPointer are not yet supported');
      return;
    }
    switch(type) {
      case 'note':
        subNote(data, onEvent);
        view(path, {type: 'note', id: data});
        break;
      case 'npub':
        subProfile(data, onEvent);
        view(path, {type: 'profile', id: data});
        break;
      default:
        console.warn(`type ${type} not yet supported`);
    }
    renderFeed();
  }
};

// onload
route(location.pathname);
history.pushState({}, '', location.pathname);

window.addEventListener('popstate', (event) => {
  route(location.pathname);
});

const handleLink = (a: HTMLAnchorElement, e: MouseEvent) => {
  const href = a.getAttribute('href');
  if (typeof href !== 'string') {
    console.warn('expected anchor to have href attribute', a);
    return;
  }
  closeSettingsView();
  closePublishView();
  if (href === location.pathname) {
    e.preventDefault();
    return;
  }
  if (
    href === '/'
    || href.startsWith('/note')
    || href.startsWith('/npub')
  ) {
    route(href);
    history.pushState({}, '', href);
    e.preventDefault();
  }
};

const handleButton = (button: HTMLButtonElement) => {
  switch(button.name) {
    case 'settings':
      toggleSettingsView();
      return;
    case 'new-note':
      togglePublishView();
      return;
    case 'back':
      closePublishView();
      return;
  }
  const id = (button.closest('[data-id]') as HTMLElement)?.dataset.id;
  if (id) {
    switch(button.name) {
      case 'reply':
        openWriteInput(button, id);
        break;
      case 'star':
          const note = replyList.find(r => r.id === id) || textNoteList.find(n => n.id === (id));
          note && handleUpvote(note);
        break;
    }
  }
  // const container = e.target.closest('[data-append]');
  // if (container) {
  //   container.append(...parseTextContent(container.dataset.append));
  //   delete container.dataset.append;
  //   return;
  // }
};

document.body.addEventListener('click', (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const a = target?.closest('a');
  if (a) {
    // dont intercept command-click
    if (event.metaKey) {
      return;
    }
    handleLink(a, event);
    return;
  }
  const button = target?.closest('button');
  if (button) {
    handleButton(button);
  }
});
