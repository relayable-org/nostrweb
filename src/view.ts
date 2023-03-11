import {elem} from './utils/dom';

type Container = {
  id: string;
  view: HTMLElement;
  content: HTMLDivElement;
  dom: {
    [eventId: string]: HTMLElement
  }
};

const containers: Array<Container> = [];

let activeContainerIndex = -1;

export const getViewContent = () => containers[activeContainerIndex]?.content;

export const clearView = () => {
  // TODO: this is clears the current view, but it should probably do this for all views
  const domMap = containers[activeContainerIndex]?.dom;
  Object.keys(domMap).forEach(eventId => delete domMap[eventId]);
  getViewContent().replaceChildren();
};

export const getViewElem = (eventId: string) => {
  return containers[activeContainerIndex]?.dom[eventId];
};

export const setViewElem = (eventId: string, node: HTMLElement) => {
  const container = containers[activeContainerIndex];
  if (container) {
    container.dom[eventId] = node;
  }
  return node;
};

const mainContainer = document.querySelector('main');

const getContainer = (route: string) => {
  let container = containers.find(c => c.id === route);
  if (container) {
    return container;
  }
  const content = elem('div', {className: 'content'});
  const view = elem('section', {className: 'view'}, [content]);
  mainContainer?.append(view);
  container = {id: route, view, content, dom: {}};
  containers.push(container);
  return container;
};

export const view = (route: string) => {
  const active = containers[activeContainerIndex];
  active?.view.classList.remove('view-active');
  const nextContainer = getContainer(route);
  const nextContainerIndex = containers.indexOf(nextContainer);
  if (nextContainerIndex === activeContainerIndex) {
    return;
  }
  if (active) {
    nextContainer.view.classList.add('view-next');
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      nextContainer.view.classList.remove('view-next', 'view-prev');
      nextContainer.view.classList.add('view-active');
    });
    // // console.log(activeContainerIndex, nextContainerIndex);
    getViewContent()?.querySelectorAll('.view-prev').forEach(prev => {
      prev.classList.remove('view-prev');
      prev.classList.add('view-next');
    });
    active?.view.classList.add(nextContainerIndex < activeContainerIndex ? 'view-next' : 'view-prev');
    activeContainerIndex = nextContainerIndex;
  });
};
