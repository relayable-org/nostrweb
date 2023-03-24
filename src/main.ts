import {Event, nip19} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';
import {elem, elemArticle, parseTextContent} from './utils/dom';
import {bounce, dateTime, formatTime} from './utils/time';
import {isWssUrl} from './utils/url';
import {sub24hFeed, subNote, subProfile} from './subscriptions'
import {getReplyTo, hasEventTag, isMention, sortByCreatedAt, sortEventCreatedAt, validatePow} from './events';
import {clearView, getViewContent, getViewElem, setViewElem, view} from './view';
import {closeSettingsView, config, toggleSettingsView} from './settings';
import {getReactions, getReactionContents, handleReaction, handleUpvote} from './reactions';
import {closePublishView, openWriteInput, togglePublishView} from './write';
import {linkPreview} from './media';
import {getMetadata, handleMetadata} from './profiles';

// curl -H 'accept: application/nostr+json' https://relay.nostr.ch/

function onEvent(evt: Event, relay: string) {
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
}

type EventWithNip19 = Event & {
  nip19: {
    note: string;
    npub: string;
  }
};
const textNoteList: Array<EventWithNip19> = []; // could use indexDB

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
  const now = Math.floor(Date.now() * 0.001);
  textNoteList
    // dont render notes from the future
    .filter(note => note.created_at <= now)
    // if difficulty filter is configured dont render notes with too little pow
    .filter(note => !config.filterDifficulty || note.tags.some(tag => hasEnoughPOW(tag, note.id)))
    .sort(sortByCreatedAt)
    .reverse()
    .forEach(renderNote);
}, 17); // (16.666 rounded, an arbitrary value to limit updates to max 60x per s)

function handleTextNote(evt: Event, relay: string) {
  if (eventRelayMap[evt.id]) {
    eventRelayMap[evt.id] = [...(eventRelayMap[evt.id]), relay]; // TODO: just push?
  } else {
    eventRelayMap[evt.id] = [relay];
    const evtWithNip19 = {
      nip19: {
        note: nip19.noteEncode(evt.id),
        npub: nip19.npubEncode(evt.pubkey),
      },
      ...evt
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
}

type EventWithNip19AndReplyTo = EventWithNip19 & {
  replyTo: string;
}

const replyList: Array<EventWithNip19AndReplyTo> = [];

function handleReply(evt: EventWithNip19, relay: string) {
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
  renderReply(evtWithReplyTo, relay);
}

function renderReply(evt: EventWithNip19AndReplyTo, relay: string) {
  const parent = getViewElem(evt.replyTo);
  if (!parent) { // root article has not been rendered
    return;
  }
  let replyContainer = parent.querySelector('.mobx-replies');
  if (!replyContainer) {
    replyContainer = elem('div', {className: 'mobx-replies'});
    parent.append(replyContainer);
  }
  const reply = createTextNote(evt, relay);
  replyContainer.append(reply);
  setViewElem(evt.id, reply);
}

config.rerenderFeed = () => {
  clearView();
  renderFeed();
};

setInterval(() => {
  document.querySelectorAll('time[datetime]').forEach((timeElem: HTMLTimeElement) => {
    timeElem.textContent = formatTime(new Date(timeElem.dateTime));
  });
}, 10000);


function createTextNote(evt: EventWithNip19, relay: string) {
  const {host, img, name, time, userName} = getMetadata(evt, relay);
  const replies = replyList.filter(({replyTo}) => replyTo === evt.id);
  // const isLongContent = evt.content.trimRight().length > 280;
  // const content = isLongContent ? evt.content.slice(0, 280) : evt.content;
  const reactions = getReactions(evt.id);
  const didReact = reactions.length && !!reactions.find(reaction => reaction.pubkey === config.pubkey);
  const replyFeed: Array<HTMLElement> = replies[0] ? replies.sort(sortByCreatedAt).map(e => setViewElem(e.id, createTextNote(e, relay))) : [];
  const [content, {firstLink}] = parseTextContent(evt.content);
  const buttons = elem('div', {className: 'buttons'}, [
    elem('button', {name: 'reply', type: 'button'}, [
      elem('img', {height: 24, width: 24, src: '/assets/comment.svg'})
    ]),
    elem('button', {name: 'star', type: 'button'}, [
      elem('img', {
        alt: didReact ? '✭' : '✩', // ♥
        height: 24, width: 24,
        src: `/assets/${didReact ? 'star-fill' : 'star'}.svg`,
        title: getReactionContents(evt.id).join(' '),
      }),
      elem('small', {data: {reactions: ''}}, reactions.length || ''),
    ]),
  ]);
  const body = elem('div', {className: 'mbox-body'}, [
    elem('header', {
      className: 'mbox-header',
      title: `User: ${userName}\n${time}\n\nUser pubkey: ${evt.pubkey}\n\nRelay: ${host}\n\nEvent-id: ${evt.id}
      ${evt.tags.length ? `\nTags ${JSON.stringify(evt.tags)}\n` : ''}
      ${evt.content}`
    }, [
      elem('a', {className: `mbox-username${name ? ' mbox-kind0-name' : ''}`, href: `/${evt.nip19.npub}`}, name || userName),
      ' ',
      elem('a', {href: `/${evt.nip19.note}`}, elem('time', {dateTime: time.toISOString()}, formatTime(time))),
    ]),
    elem('div', {/* data: isLongContent ? {append: evt.content.slice(280)} : null*/}, [
      ...content,
      (firstLink && validatePow(evt)) ? linkPreview(firstLink, evt.id, relay) : null,
    ]),
    buttons,
  ]);
  if (localStorage.getItem('reply_to') === evt.id) {
    openWriteInput(buttons, evt.id);
  }
  return elemArticle([
    elem('div', {className: 'mbox-img'}, img),
    body,
    ...(replies[0] ? [elem('div', {className: 'mobx-replies'}, replyFeed.reverse())] : []),
  ], {data: {id: evt.id, pubkey: evt.pubkey, relay}});
}

function handleRecommendServer(evt: Event, relay: string) {
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
}

function renderRecommendServer(evt: Event, relay: string) {
  const {img, name, time, userName} = getMetadata(evt, relay);
  const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
    elem('header', {className: 'mbox-header'}, [
      elem('small', {}, [
        elem('strong', {}, userName)
      ]),
    ]),
    ` recommends server: ${evt.content}`,
  ]);
  return elemArticle([
    elem('div', {className: 'mbox-img'}, [img]), body
  ], {className: 'mbox-recommend-server', data: {id: evt.id, pubkey: evt.pubkey}});
}

// subscribe and change view
function route(path: string) {
  if (path === '/') {
    sub24hFeed(onEvent);
    view('/');
  } else if (path.length === 64 && path.match(/^\/[0-9a-z]+$/)) {
    const {type, data} = nip19.decode(path.slice(1));
    if (typeof data !== 'string') {
      console.warn('nip19 ProfilePointer, EventPointer and AddressPointer are not yet supported');
      return;
    }
    switch(type) {
      case 'note':
        subNote(data, onEvent);
        view(path);
        break;
      case 'npub':
        subProfile(data, onEvent);
        view(path);
        break;
      default:
        console.warn(`type ${type} not yet supported`);
    }
  }
}

// onload
route(location.pathname);
history.pushState({}, '', location.pathname);

window.addEventListener('popstate', (event) => {
  // console.log(`popstate: ${location.pathname}, state: ${JSON.stringify(event.state)}`);
  route(location.pathname);
});

const handleLink = (a: HTMLAnchorElement, e: MouseEvent) => {
  const href = a.getAttribute('href');
  if (typeof href !== 'string') {
    console.warn('expected anchor to have href attribute', a);
    return;
  }
  if (
    href === '/'
    || href.startsWith('/note')
    || href.startsWith('/npub')
  ) {
    closeSettingsView();
    closePublishView();
    route(href);
    history.pushState({}, '', href);
    e.preventDefault();
  }
};

const handleButton = (button: HTMLButtonElement) => {
  const id = (button.closest('[data-id]') as HTMLElement)?.dataset.id;
  if (!id) {
    return;
  }
  switch(button.name) {
    case 'reply':
      openWriteInput(button, id);
      break;
    case 'star':
      const note = replyList.find(r => r.id === id) || textNoteList.find(n => n.id === (id));
      note && handleUpvote(note);
      break;
    case 'settings':
      toggleSettingsView();
      break;
    case 'new-note':
      togglePublishView();
      break;
    case 'back':
      closePublishView();
      break;
  }
  // const container = e.target.closest('[data-append]');
  // if (container) {
  //   container.append(...parseTextContent(container.dataset.append));
  //   delete container.dataset.append;
  //   return;
  // }
};

document.body.addEventListener('click', (event: MouseEvent) => {
  if (event.target instanceof HTMLElement) {
    const a = event.target?.closest('a');
    if (a) {
      handleLink(a, event);
      return;
    }
    const button = event.target.closest('button');
    if (button) {
      handleButton(button);
    }
  }
});
