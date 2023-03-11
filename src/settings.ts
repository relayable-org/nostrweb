import {generatePrivateKey, getPublicKey} from 'nostr-tools';

let pubkey = '';

const loadOrGeneraateKeys = () => {
  const storedPubKey = localStorage.getItem('pub_key');
  if (storedPubKey) {
    return storedPubKey;
  }
  const privatekey = generatePrivateKey();
  const pubkey = getPublicKey(privatekey);
  localStorage.setItem('private_key', privatekey);
  localStorage.setItem('pub_key', pubkey);
  return pubkey;
};

/**
 * global config object
 * config.pubkey, if not set loaded from localStorage or generate a new key
 */
export const config = {
  get pubkey() {
    if (!pubkey) {
      pubkey = loadOrGeneraateKeys();
    }
    return pubkey;
  },
  set pubkey(value) {
    console.info(`pubkey was set to ${value}`)
    pubkey = value;
  }
};

