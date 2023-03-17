import {generatePrivateKey, getPublicKey} from 'nostr-tools';

let pubkey: string = '';

const loadOrGenerateKeys = () => {
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

let filterDifficulty: number = 0;
let difficulty: number = 16;
let timeout: number = 5;
let rerenderFeed: (() => void) | undefined;

/**
 * global config object
 * config.pubkey, if not set loaded from localStorage or generate a new key
 */
export const config = {
  get pubkey() {
    if (!pubkey) {
      pubkey = loadOrGenerateKeys();
    }
    return pubkey;
  },
  set pubkey(value) {
    console.info(`pubkey was set to ${value}`);
    pubkey = value;
  },
  get filterDifficulty() {
    return filterDifficulty;
  },
  get difficulty() {
    return difficulty;
  },
  get timeout() {
    return timeout;
  },
  set rerenderFeed(value: () => void) {
    rerenderFeed = value;
  }
};

const getNumberFromStorage = (
  item: string,
  fallback: number,
) => {
  const stored = localStorage.getItem(item);
  if (!stored) {
    return fallback;
  }
  return Number(stored);
};

// filter difficulty
const filterDifficultyInput = document.querySelector('#filterDifficulty') as HTMLInputElement;
const filterDifficultyDisplay = document.querySelector('[data-display="filter_difficulty"]') as HTMLElement;
filterDifficultyInput.addEventListener('input', (e) => {
  localStorage.setItem('filter_difficulty', filterDifficultyInput.value);
  filterDifficulty = filterDifficultyInput.valueAsNumber;
  filterDifficultyDisplay.textContent = filterDifficultyInput.value;
  rerenderFeed && rerenderFeed();
});
filterDifficulty = getNumberFromStorage('filter_difficulty', 0);
filterDifficultyInput.valueAsNumber = filterDifficulty;
filterDifficultyDisplay.textContent = filterDifficultyInput.value;

// mining difficulty target
const miningTargetInput = document.querySelector('#miningTarget') as HTMLInputElement;
miningTargetInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_target', miningTargetInput.value);
  difficulty = miningTargetInput.valueAsNumber;
});
// arbitrary difficulty default, still experimenting.
difficulty = getNumberFromStorage('mining_target', 16);
miningTargetInput.valueAsNumber = difficulty;

// mining timeout
const miningTimeoutInput = document.querySelector('#miningTimeout') as HTMLInputElement;
miningTimeoutInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_timeout', miningTimeoutInput.value);
  timeout = miningTimeoutInput.valueAsNumber;
});
timeout = getNumberFromStorage('mining_timeout', 5);
miningTimeoutInput.valueAsNumber = timeout;
