import {signEvent} from 'nostr-tools';
import {elemShrink, updateElemHeight} from './utils/dom';
import {powEvent} from './system';
import {config} from './settings';
import {publish} from './relays';

// form used to write and publish textnotes for replies and new notes
const writeForm = document.querySelector('#writeForm') as HTMLFormElement;
const writeInput = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;

// overlay for writing new text notes
const publishView = document.querySelector('#newNote') as HTMLElement;

const openWriteView = () => {
  publishView.append(writeForm);
  if (writeInput.value.trimRight()) {
    writeInput.style.removeProperty('height');
  }
  requestAnimationFrame(() => {
    updateElemHeight(writeInput);
    writeInput.focus();
  });
  publishView.removeAttribute('hidden');
};

export const closePublishView = () => publishView.hidden = true;

export const togglePublishView = () => {
  if (publishView.hidden) {
    localStorage.removeItem('reply_to'); // should it forget old replyto context?
    openWriteView();
  } else {
    publishView.hidden = true;
  }
};

const appendReplyForm = (el: HTMLElement) => {
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
};

const closeWriteInput = () => writeInput.blur();

export const openWriteInput = (
  button: HTMLElement,
  id: string,
) => {
  appendReplyForm(button.closest('.buttons') as HTMLElement);
  localStorage.setItem('reply_to', id);
};

export const toggleWriteInput = (
  button: HTMLElement,
  id: string,
) => {
  if (id && localStorage.getItem('reply_to') === id) {
    closeWriteInput();
    return;
  }
  appendReplyForm(button.closest('.buttons') as HTMLElement);
  localStorage.setItem('reply_to', id);
};

// const updateWriteInputHeight = () => updateElemHeight(writeInput);

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

// document.body.addEventListener('keyup', (e) => {
//   if (e.key === 'Escape') {
//     hideNewMessage(true);
//   }
// });

const sendStatus = document.querySelector('#sendstatus') as HTMLElement;
const publishBtn = document.querySelector('#publish') as HTMLButtonElement;
const onSendError = (err: Error) => sendStatus.textContent = err.message;

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
