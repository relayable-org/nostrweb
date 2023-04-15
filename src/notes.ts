import {Event} from 'nostr-tools';

export type EventWithNip19 = Event & {
  nip19: {
    note: string;
    npub: string;
  }
};

export const textNoteList: Array<EventWithNip19> = []; // could use indexDB

export type EventWithNip19AndReplyTo = EventWithNip19 & {
  replyTo: string;
};

export const replyList: Array<EventWithNip19AndReplyTo> = [];
