import {Event} from  'nostr-tools';
import {elem, elemArticle, parseTextContent} from './utils/dom';
import {dateTime, formatTime} from './utils/time';
import {validatePow, sortByCreatedAt} from './events';
import {setViewElem} from './view';
import {config} from './settings';
import {getReactions, getReactionContents} from './reactions';
import {openWriteInput} from './write';
import {linkPreview} from './media';
import {getMetadata} from './profiles';
import {EventWithNip19, replyList} from './notes';

setInterval(() => {
  document.querySelectorAll('time[datetime]').forEach((timeElem: HTMLTimeElement) => {
    timeElem.textContent = formatTime(new Date(timeElem.dateTime));
  });
}, 10000);

export const createTextNote = (
  evt: EventWithNip19,
  relay: string,
) => {
  const {host, img, name, time, userName} = getMetadata(evt, relay);
  const replies = replyList.filter(({replyTo}) => replyTo === evt.id);
  // const isLongContent = evt.content.trimRight().length > 280;
  // const content = isLongContent ? evt.content.slice(0, 280) : evt.content;
  const reactions = getReactions(evt.id);
  const didReact = reactions.length && !!reactions.find(reaction => reaction.pubkey === config.pubkey);
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
  if (localStorage.getItem('reply_to') === evt.id) {
    openWriteInput(buttons, evt.id);
  }
  const replyFeed: Array<HTMLElement> = replies[0] ? replies.sort(sortByCreatedAt).map(e => setViewElem(e.id, createTextNote(e, relay))) : [];
  return elemArticle([
    elem('div', {className: 'mbox-img'}, img),
    elem('div', {className: 'mbox-body'}, [
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
    ]),
    ...(replies[0] ? [elem('div', {className: 'mobx-replies'}, replyFeed.reverse())] : []),
  ], {data: {id: evt.id, pubkey: evt.pubkey, relay}});
};

export const renderRecommendServer = (evt: Event, relay: string) => {
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
};
