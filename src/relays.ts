import {Event, Filter, relayInit, Relay, Sub} from 'nostr-tools';

type SubCallback = (
  event: Readonly<Event>,
  relay: Readonly<string>,
) => void;

type Subscribe = {
  cb: SubCallback;
  filter: Filter;
};

const relayList: Array<Relay> = [];
const subList: Array<Sub> = [];
const currentSubList: Array<Subscribe> = [];

export const addRelay = async (url: string) => {
  const relay = relayInit(url);
  relay.on('connect', () => {
    console.info(`connected to ${relay.url}`);
  });
  relay.on('error', () => {
    console.warn(`failed to connect to ${relay.url}`);
  });
  try {
    await relay.connect();
    currentSubList.forEach(({cb, filter}) => subscribe(cb, filter, relay));
    relayList.push(relay);
  } catch {
    console.warn(`could not connect to ${url}`);
  }
};

const unsubscribe = (sub: Sub) => {
  sub.unsub();
  subList.splice(subList.indexOf(sub), 1);
};

const subscribe = (
  cb: SubCallback,
  filter: Filter,
  relay: Relay,
) => {
  const sub = relay.sub([filter]);
  subList.push(sub);
  sub.on('event', (event: Event) => {
    cb(event, relay.url);
  });
  sub.on('eose', () => {
    // console.log('eose', relay.url);
    // unsubscribe(sub);
  });
};

const subscribeAll = (
  cb: SubCallback,
  filter: Filter,
) => {
  relayList.forEach(relay => subscribe(cb, filter, relay));
};

export const sub = (obj: Subscribe) => {
  currentSubList.push(obj);
  subscribeAll(obj.cb, obj.filter);
};

export const unsubAll = () => {
  subList.forEach(unsubscribe);
  currentSubList.length = 0;
};

type PublishCallback = (
  relay: string,
  errorMessage?: string,
) => void;

export const publish = (
  event: Event,
  cb: PublishCallback,
) => {
  relayList.forEach(relay => {
    const pub = relay.publish(event);
    pub.on('ok', () => {
      console.info(`${relay.url} has accepted our event`);
      cb(relay.url);
    });
    pub.on('failed', (reason: any) => {
      console.error(`failed to publish to ${relay.url}: ${reason}`);
      cb(relay.url, reason);
    });
  });
};

addRelay('wss://relay.snort.social'); // good one
addRelay('wss://nostr.bitcoiner.social');
addRelay('wss://nostr.mom');
addRelay('wss://relay.nostr.bg');
addRelay('wss://nos.lol');
addRelay('wss://relay.nostr.ch');
