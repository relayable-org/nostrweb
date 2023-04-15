import {Event} from 'nostr-tools';
import {elem, elemCanvas} from './utils/dom';
import {getHost, getNoxyUrl} from './utils/url';
import {getViewContent, getViewElem} from './view';
import {validatePow} from './events';
import {parseContent} from './media';

type Metadata = {
  name?: string;
  about?: string;
  picture?: string;
};

type Profile = {
  metadata: {
    [relay: string]: Metadata;
  };
  name?: string;
  picture?: string;
  pubkey: string;
};

const userList: Array<Profile> = [];
// const tempContactList = {};

const setMetadata = (
  evt: Event,
  relay: string,
  metadata: Metadata,
) => {
  let user = userList.find(u => u.pubkey === evt.pubkey);
  if (!user) {
    user = {
      metadata: {[relay]: metadata},
      pubkey: evt.pubkey,
    };
    userList.push(user);
  } else {
    user.metadata[relay] = {
      ...user.metadata[relay],
      // timestamp: evt.created_at,
      ...metadata,
    };
  }

  // store the first seen name (for now) as main user.name
  if (!user.name && metadata.name) {
    user.name = metadata.name;
  }

  // use the first seen profile pic (for now), pics from different relays are not supported yet
  if (!user.picture && metadata.picture) {
    const imgUrl = getNoxyUrl('data', metadata.picture, evt.id, relay);
    if (imgUrl) {
      user.picture = imgUrl.href;

      // update profile images that used some nip-13 work
      if (imgUrl.href && validatePow(evt)) {
        document.body
          .querySelectorAll(`canvas[data-pubkey="${evt.pubkey}"]`)
          .forEach(canvas => canvas.parentNode?.replaceChild(elem('img', {src: imgUrl.href}), canvas));
      }
    }
  }

  // update profile names
  const name = user.metadata[relay].name || user.name || '';
  if (name) {
    document.body
      // TODO: this should not depend on specific DOM structure, move pubkey info on username element
      .querySelectorAll(`[data-pubkey="${evt.pubkey}"] > .mbox-body > header .mbox-username:not(.mbox-kind0-name)`)
      .forEach((username: HTMLElement) => {
        username.textContent = name;
        username.classList.add('mbox-kind0-name');
      });
  }
  // if (tempContactList[relay]) {
  //   const updates = tempContactList[relay].filter(update => update.pubkey === evt.pubkey);
  //   if (updates) {
  //     console.log('TODO: add contact list (kind 3)', updates);
  //   }
  // }
};

export const handleMetadata = (evt: Event, relay: string) => {
  const content = parseContent(evt.content);
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    console.warn('expected nip-01 JSON object with user info, but got something funny', evt);
    return;
  }
  const hasNameString = 'name' in content && typeof content.name === 'string';
  const hasAboutString = 'about' in content && typeof content.about === 'string';
  const hasPictureString = 'picture' in content && typeof content.picture === 'string';
  // custom
  const hasDisplayName = 'display_name' in content && typeof content.display_name === 'string';
  if (!hasNameString && !hasAboutString && !hasPictureString && !hasDisplayName) {
    console.warn('expected basic nip-01 user info (name, about, picture) but nothing found', evt);
    return;
  }
  const metadata: Metadata = {
    ...(hasNameString && {name: content.name as string} || hasDisplayName && {name: content.display_name as string}),
    ...(hasAboutString && {about: content.about as string}),
    ...(hasPictureString && {picture: content.picture as string}),
  };
  setMetadata(evt, relay, metadata);
};

export const getProfile = (pubkey: string) => userList.find(user => user.pubkey === pubkey);

export const getMetadata = (evt: Event, relay: string) => {
  const host = getHost(relay);
  const user = getProfile(evt.pubkey);
  const userImg = user?.picture;
  const name = user?.metadata[relay]?.name || user?.name;
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
};

/* export function handleContactList(evt, relay) {
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
} */

// function renderUpdateContact(evt, relay) {
//   const {img, time, userName} = getMetadata(evt, relay);
//   const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
//     elem('header', {className: 'mbox-header'}, [
//       elem('small', {}, []),
//     ]),
//     elem('pre', {title: JSON.stringify(evt.content)}, [
//       elem('strong', {}, userName),
//       ' updated contacts: ',
//       JSON.stringify(evt.tags),
//     ]),
//   ]);
//   return renderArticle([img, body], {className: 'mbox-updated-contact', data: {id: evt.id, pubkey: evt.pubkey, relay}});
// }

export const renderProfile = (id: string) => {
  const content = getViewContent();
  const header = getViewElem(id);
  if (!content || !header) {
    return;
  }
  const profile = getProfile(id);
  if (profile && profile.name) {
    const h1 = header.querySelector('h1');
    if (h1) {
      h1.textContent = profile.name;
    } else {
      header.prepend(elem('h1', {}, profile.name));
    }
  }
};