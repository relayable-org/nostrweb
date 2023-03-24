import {nip19} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';
import {elem, parseTextContent} from './utils/dom';
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

function onEvent(evt, relay) {
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

const textNoteList = []; // could use indexDB
const eventRelayMap = {}; // eventId: [relay1, relay2]

const renderNote = (evt, i, sortedFeeds) => {
  if (getViewElem(evt.id)) { // note already in view
    return;
  }
  const article = createTextNote(evt, eventRelayMap[evt.id]);
  if (i === 0) {
    getViewContent().append(article);
  } else {
    getViewElem(sortedFeeds[i - 1].id).before(article);
  }
  setViewElem(evt.id, article);
};

const hasEnoughPOW = ([tag, , commitment], eventId) => {
  return tag === 'nonce' && commitment >= config.filterDifficulty && zeroLeadingBitsCount(eventId) >= config.filterDifficulty;
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

function handleTextNote(evt, relay) {
  if (eventRelayMap[evt.id]) {
    eventRelayMap[evt.id] = [relay, ...(eventRelayMap[evt.id])];
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

const replyList = [];

function handleReply(evt, relay) {
  if (
    getViewElem(evt.id) // already rendered probably received from another relay
    || evt.tags.some(isMention) // ignore mentions for now
  ) {
    return;
  }
  const replyTo = getReplyTo(evt);
  const evtWithReplyTo = {replyTo, ...evt};
  replyList.push(evtWithReplyTo);
  renderReply(evtWithReplyTo, relay);
}

function renderReply(evt, relay) {
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
  document.querySelectorAll('time[datetime]').forEach(timeElem => {
    timeElem.textContent = formatTime(new Date(timeElem.dateTime));
  });
}, 10000);


function createTextNote(evt, relay) {
  const {host, img, name, time, userName} = getMetadata(evt, relay);
  const replies = replyList.filter(({replyTo}) => replyTo === evt.id);
  // const isLongContent = evt.content.trimRight().length > 280;
  // const content = isLongContent ? evt.content.slice(0, 280) : evt.content;
  const reactions = getReactions(evt.id);
  const didReact = reactions.length && !!reactions.find(reaction => reaction.pubkey === config.pubkey);
  const replyFeed = replies[0] ? replies.sort(sortByCreatedAt).map(e => setViewElem(e.id, createTextNote(e, relay))) : [];
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
      (firstLink && validatePow(evt)) ? linkPreview(firstLink, evt.id, relay) : '',
    ]),
    buttons,
  ]);
  if (localStorage.getItem('reply_to') === evt.id) {
    openWriteInput(buttons);
  }
  return renderArticle([
    elem('div', {className: 'mbox-img'}, [img]), body,
    replies[0] ? elem('div', {className: 'mobx-replies'}, replyFeed.reverse()) : '',
  ], {data: {id: evt.id, pubkey: evt.pubkey, relay}});
}

function handleRecommendServer(evt, relay) {
  if (getViewElem(evt.id) || !isWssUrl(evt.content)) {
    return;
  }
  const art = renderRecommendServer(evt, relay);
  if (textNoteList.length < 2) {
    getViewContent().append(art);
  } else {
    const closestTextNotes = textNoteList
      .filter(note => !config.filterDifficulty || note.tags.some(([tag, , commitment]) => tag === 'nonce' && commitment >= config.filterDifficulty)) // TODO: prob change to hasEnoughPOW
      .sort(sortEventCreatedAt(evt.created_at));
    getViewElem(closestTextNotes[0].id)?.after(art); // TODO: note might not be in the dom yet, recommendedServers could be controlled by renderFeed
  }
  setViewElem(evt.id, art);
}

function renderRecommendServer(evt, relay) {
  const {img, name, time, userName} = getMetadata(evt, relay);
  const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
    elem('header', {className: 'mbox-header'}, [
      elem('small', {}, [
        elem('strong', {}, userName)
      ]),
    ]),
    ` recommends server: ${evt.content}`,
  ]);
  return renderArticle([
    elem('div', {className: 'mbox-img'}, [img]), body
  ], {className: 'mbox-recommend-server', data: {id: evt.id, pubkey: evt.pubkey}});
}

function renderArticle(content, props = {}) {
  const className = props.className ? ['mbox', props?.className].join(' ') : 'mbox';
  return elem('article', {...props, className}, content);
}

// subscribe and change view
function route(path) {
  if (path === '/') {
    sub24hFeed(onEvent);
    view('/');
  } else if (path.length === 64 && path.match(/^\/[0-9a-z]+$/)) {
    const {type, data} = nip19.decode(path.slice(1));
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

const handleLink = (e, a) => {
  const href = a.getAttribute('href');
  if (
    href === '/'
    || href.startsWith('/note')
    || href.startsWith('/npub')
  ) {
    closeSettingsView();
    closePublishView();
    route(href);
    history.pushState({}, null, href);
    e.preventDefault();
  }
};

const handleButton = (e, button) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  switch(button.name) {
    case 'reply':
      openWriteInput(button, id);
      break;
    case 'star':
      const note = replyList.find(r => r.id === id) || textNoteList.find(n => n.id === (id));
      handleUpvote(note);
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

document.body.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a) {
    handleLink(e, a);
    return;
  }
  const button = e.target.closest('button');
  if (button) {
    handleButton(e, button);
  }
});
