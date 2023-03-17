import {nip19} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';
import {elem, elemCanvas, elemShrink, parseTextContent, updateElemHeight} from './utils/dom';
import {bounce, dateTime, formatTime} from './utils/time';
import {getHost, getNoxyUrl, isWssUrl} from './utils/url';
import {powEvent} from './system';
import {sub24hFeed, subNote, subProfile} from './subscriptions'
import {publish} from './relays';
import {getReplyTo, hasEventTag, isMention, sortByCreatedAt, sortEventCreatedAt, validatePow} from './events';
import {clearView, getViewContent, getViewElem, setViewElem, view} from './view';
import {closeSettingsView, config, toggleSettingsView} from './settings';
import {getReactions, getReactionContents, handleReaction, handleUpvote} from './reactions';
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

const restoredReplyTo = localStorage.getItem('reply_to');

config.rerenderFeed = () => {
  clearView();
  renderFeed();
};

setInterval(() => {
  document.querySelectorAll('time[datetime]').forEach(timeElem => {
    timeElem.textContent = formatTime(new Date(timeElem.dateTime));
  });
}, 10000);

const fetchQue = [];
let fetchPending;
const fetchNext = (href, id, relay) => {
  const noxy = getNoxyUrl('meta', href, id, relay);
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
      const content = [];
      if (meta.images[0]) {
        content.push(elem('img', {className: 'preview-image', loading: 'lazy', src: getNoxyUrl('data', meta.images[0], id, relay).href}));
      }
      if (meta.title) {
        content.push(elem('h2', {className: 'preview-title'}, meta.title));
      }
      if (meta.descr) {
        content.push(elem('p', {className: 'preview-descr'}, meta.descr))
      }
      if (content.length) {
        container.append(elem('a', {href, rel: 'noopener noreferrer', target: '_blank'}, content));
        container.classList.add('preview-loaded');
      }
    })
    .finally(() => {
      fetchPending = false;
      if (fetchQue.length) {
        const {href, id, relay} = fetchQue.shift();
        return fetchNext(href, id, relay);
      }
    })
    .catch(err => err.text && err.text())
    .then(errMsg => errMsg && console.warn(errMsg));
  return previewId;
};

function linkPreview(href, id, relay) {
  if ((/\.(gif|jpe?g|png)$/i).test(href)) {
    return elem('div', {},
      [elem('img', {className: 'preview-image-only', loading: 'lazy', src: getNoxyUrl('data', href, id, relay).href})]
    );
  }
  const previewId = fetchNext(href, id, relay);
  return elem('div', {
    className: 'preview',
    id: previewId
  });
}

const writeInput = document.querySelector('textarea[name="message"]');

function createTextNote(evt, relay) {
  const {host, img, name, time, userName} = getMetadata(evt, relay);
  const replies = replyList.filter(({replyTo}) => replyTo === evt.id);
  // const isLongContent = evt.content.trimRight().length > 280;
  // const content = isLongContent ? evt.content.slice(0, 280) : evt.content;
  const reactions = getReactions(evt.id);
  const didReact = reactions.length && !!reactions.find(reaction => reaction.pubkey === config.pubkey);
  const replyFeed = replies[0] ? replies.sort(sortByCreatedAt).map(e => setViewElem(e.id, createTextNote(e, relay))) : [];
  const [content, {firstLink}] = parseTextContent(evt.content);
  const body = elem('div', {className: 'mbox-body'}, [
    elem('header', {
      className: 'mbox-header',
      title: `User: ${userName}\n${time}\n\nUser pubkey: ${evt.pubkey}\n\nRelay: ${host}\n\nEvent-id: ${evt.id}
      ${evt.tags.length ? `\nTags ${JSON.stringify(evt.tags)}\n` : ''}
      ${evt.content}`
    }, [
      elem('a', {className: `mbox-username${name ? ' mbox-kind0-name' : ''}`, href: `/${evt.nip19.npub}`, data: {nav: true}}, name || userName),
      ' ',
      elem('a', {href: `/${evt.nip19.note}`, data: {nav: true}}, formatTime(time)),
    ]),
    elem('div', {/* data: isLongContent ? {append: evt.content.slice(280)} : null*/}, [
      ...content,
      (firstLink && validatePow(evt)) ? linkPreview(firstLink, evt.id, relay) : '',
    ]),
    elem('div', {className: 'buttons'}, [
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
    ]),
  ]);
  if (restoredReplyTo === evt.id) {
    appendReplyForm(body.querySelector('.buttons'));
    requestAnimationFrame(() => updateElemHeight(writeInput));
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

function handleContactList(evt, relay) {
  if (getViewElem(evt.id)) {
    return;
  }
  const art = renderUpdateContact(evt, relay);
  if (textNoteList.length < 2) {
    getViewContent().append(art);
    return;
  }
  const closestTextNotes = textNoteList.sort(sortEventCreatedAt(evt.created_at));
  getViewElem(closestTextNotes[0].id).after(art);
  setViewElem(evt.id, art);
  // const user = userList.find(u => u.pupkey === evt.pubkey);
  // if (user) {
  //   console.log(`TODO: add contact list for ${evt.pubkey.slice(0, 8)} on ${relay}`, evt.tags);
  // } else {
  //   tempContactList[relay] = tempContactList[relay]
  //     ? [...tempContactList[relay], evt]
  //     : [evt];
  // }
}

function renderUpdateContact(evt, relay) {
  const {img, time, userName} = getMetadata(evt, relay);
  const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
    elem('header', {className: 'mbox-header'}, [
      elem('small', {}, []),
    ]),
    elem('pre', {title: JSON.stringify(evt.content)}, [
      elem('strong', {}, userName),
      ' updated contacts: ',
      JSON.stringify(evt.tags),
    ]),
  ]);
  return renderArticle([img, body], {className: 'mbox-updated-contact', data: {id: evt.id, pubkey: evt.pubkey, relay}});
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

const userList = [];
// const tempContactList = {};

function parseContent(content) {
  try {
    return JSON.parse(content);
  } catch(err) {
    console.log(evt);
    console.error(err);
  }
}

function handleMetadata(evt, relay) {
  const content = parseContent(evt.content);
  if (content) {
    setMetadata(evt, relay, content);
  }
}

function setMetadata(evt, relay, content) {
  let user = userList.find(u => u.pubkey === evt.pubkey);
  const picture = getNoxyUrl('data', content.picture, evt.id, relay).href;
  if (!user) {
    user = {
      metadata: {[relay]: content},
      ...(content.picture && {picture}),
      pubkey: evt.pubkey,
    };
    userList.push(user);
  } else {
    user.metadata[relay] = {
      ...user.metadata[relay],
      timestamp: evt.created_at,
      ...content,
    };
    // use only the first profile pic (for now), different pics on each releay are not supported yet
    if (!user.picture) {
      user.picture = picture;
    }
  }
  // update profile images
  if (user.picture && validatePow(evt)) {
    document.body
      .querySelectorAll(`canvas[data-pubkey="${evt.pubkey}"]`)
      .forEach(canvas => (canvas.parentNode.replaceChild(elem('img', {src: user.picture}), canvas)));
  }
  if (user.metadata[relay].name) {
    document.body
      .querySelectorAll(`[data-id="${evt.pubkey}"] .mbox-username:not(.mbox-kind0-name)`)
      .forEach(username => {
        username.textContent = user.metadata[relay].name;
        username.classList.add('mbox-kind0-name');
      });
  }
  // if (tempContactList[relay]) {
  //   const updates = tempContactList[relay].filter(update => update.pubkey === evt.pubkey);
  //   if (updates) {
  //     console.log('TODO: add contact list (kind 3)', updates);
  //   }
  // }
}

function getMetadata(evt, relay) {
  const host = getHost(relay);
  const user = userList.find(user => user.pubkey === evt.pubkey);
  const userImg = user?.picture;
  const name = user?.metadata[relay]?.name;
  const userName = name || evt.pubkey.slice(0, 8);
  const userAbout = user?.metadata[relay]?.about || '';
  const img = (userImg && validatePow(evt)) ? elem('img', {
    alt: `${userName} ${host}`,
    loading: 'lazy',
    src: userImg,
    title: `${userName} on ${host} ${userAbout}`,
  }) : elemCanvas(evt.pubkey);
  const time = new Date(evt.created_at * 1000);
  return {host, img, name, time, userName};
}

const writeForm = document.querySelector('#writeForm');

writeInput.addEventListener('focusout', () => {
  const reply_to = localStorage.getItem('reply_to');
  if (reply_to && writeInput.value === '') {
    writeInput.addEventListener('transitionend', (event) => {
      if (!reply_to || reply_to === localStorage.getItem('reply_to') && !writeInput.style.height) { // should prob use some class or data-attr instead of relying on height
        writeForm.after(elemShrink(writeInput));
        writeForm.remove();
        localStorage.removeItem('reply_to');
      }
    }, {once: true});
  }
});

function appendReplyForm(el) {
  writeForm.before(elemShrink(writeInput));
  writeInput.blur();
  writeInput.style.removeProperty('height');
  el.after(writeForm);
  if (writeInput.value && !writeInput.value.trimRight()) {
    writeInput.value = '';
  } else {
    requestAnimationFrame(() => updateElemHeight(writeInput));
  }
  requestAnimationFrame(() => writeInput.focus());
}

// send
const sendStatus = document.querySelector('#sendstatus');
const onSendError = err => sendStatus.textContent = err.message;
const publishBtn = document.querySelector('#publish');
writeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const privatekey = localStorage.getItem('private_key');
  if (!config.pubkey || !privatekey) {
    return onSendError(new Error('no pubkey/privatekey'));
  }
  const content = writeInput.value.trimRight();
  if (!content) {
    return onSendError(new Error('message is empty'));
  }
  const replyTo = localStorage.getItem('reply_to');
  const close = () => {
    sendStatus.textContent = '';
    writeInput.value = '';
    writeInput.style.removeProperty('height');
    publishBtn.disabled = true;
    if (replyTo) {
      localStorage.removeItem('reply_to');
      publishView.append(writeForm);
    }
    publishView.hidden = true;
  };
  const tags = replyTo ? [['e', replyTo]] : []; // , eventRelayMap[replyTo][0]
  const newEvent = await powEvent({
    kind: 1,
    content,
    pubkey: config.pubkey,
    tags,
    created_at: Math.floor(Date.now() * 0.001),
  }, {
    difficulty: config.difficulty,
    statusElem: sendStatus,
    timeout: config.timeout,
  }).catch(console.warn);
  if (!newEvent) {
    close();
    return;
  }
  const sig = signEvent(newEvent, privatekey);
  // TODO validateEvent
  if (sig) {
    sendStatus.textContent = 'publishing…';
    publish({...newEvent, sig}, (relay, error) => {
      if (error) {
        return console.log(error, relay);
      }
      console.info(`publish request sent to ${relay}`);
      close();
    });
  }
});

writeInput.addEventListener('input', () => {
  publishBtn.disabled = !writeInput.value.trimRight();
  updateElemHeight(writeInput);
});
writeInput.addEventListener('blur', () => sendStatus.textContent = '');

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

const publishView = document.querySelector('#newNote');

const handleLink = (e, a) => {
  if ('nav' in a.dataset) {
    e.preventDefault();
    closeSettingsView();
    if (!publishView.hidden) {
      publishView.hidden = true;
    }
    const href = a.getAttribute('href');
    route(href);
    history.pushState({}, null, href);
    e.preventDefault();
  }
};

const handleButton = (e, button) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  switch(button.name) {
    case 'reply':
      if (localStorage.getItem('reply_to') === id) {
        writeInput.blur();
        return;
      }
      appendReplyForm(button.closest('.buttons'));
      localStorage.setItem('reply_to', id);
      break;
    case 'star':
      const note = replyList.find(r => r.id === id) || textNoteList.find(n => n.id === (id));
      handleUpvote(note);
      break;
    case 'settings':
      toggleSettingsView();
      break;
    case 'new-note':
      if (publishView.hidden) {
        localStorage.removeItem('reply_to'); // should it forget old replyto context?
        publishView.append(writeForm);
        if (writeInput.value.trimRight()) {
          writeInput.style.removeProperty('height');
        }
        requestAnimationFrame(() => {
          updateElemHeight(writeInput);
          writeInput.focus();
        });
        publishView.removeAttribute('hidden');
      } else {
        publishView.hidden = true;
      }
      break;
    case 'back':
      publishView.hidden = true;
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

// document.body.addEventListener('keyup', (e) => {
//   if (e.key === 'Escape') {
//     hideNewMessage(true);
//   }
// });
