import {elem} from './utils/dom';

type ViewOptions = {
  type: 'feed'
} | {
  type: 'note';
  id: string;
} | {
  type: 'profile';
  id: string;
};

type DOMMap = {
  [id: string]: HTMLElement
};

type Container = {
  id: string;
  options: ViewOptions,
  view: HTMLElement;
  content: HTMLDivElement;
  dom: DOMMap;
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

export const getViewElem = (id: string) => {
  return containers[activeContainerIndex]?.dom[id];
};

export const setViewElem = (id: string, node: HTMLElement) => {
  const container = containers[activeContainerIndex];
  if (container) {
    container.dom[id] = node;
  }
  return node;
};

const mainContainer = document.querySelector('main') as HTMLElement;

const createContainer = (
  route: string,
  options: ViewOptions,
) => {
  const content = elem('div', {className: 'content'});
  const dom: DOMMap = {};
  switch (options.type) {
    case 'profile':
      const header = elem('header', {}, 
        elem('small', {}, route)
      );
      dom[options.id] = header;
      content.append(header);
      break;
    case 'note':
      break;
    case 'feed':
      break;
  }
  const view = elem('section', {className: 'view'}, [content]);
  const container = {id: route, options, view, content, dom};
  mainContainer.append(view);
  containers.push(container);
  return container;
};

type GetViewOptions = () => ViewOptions;

export const getViewOptions: GetViewOptions = () => containers[activeContainerIndex]?.options || {type: 'feed'};

export const view = (
  route: string,
  options: ViewOptions,
) => {
  const active = containers[activeContainerIndex];
  const nextContainer = containers.find(c => c.id === route) || createContainer(route, options);
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
    });
    active?.view.classList.add(nextContainerIndex < activeContainerIndex ? 'view-next' : 'view-prev');
    activeContainerIndex = nextContainerIndex;
  });
};
