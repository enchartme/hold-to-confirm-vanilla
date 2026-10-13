import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  holdButton,
  holdButtonStyles,
  holdToConfirm,
  injectHoldButtonStyles
} from '../src/index.js';

class FakeClassList {
  values = new Set();

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeStyle {
  values = new Map();

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  getPropertyValue(name) {
    return this.values.get(name) || '';
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeElement {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      button: 0,
      isPrimary: true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...properties
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

class FakeDocument {
  constructor() {
    this.styles = [];
    this.head = {
      append: (element) => this.styles.push(element)
    };
  }

  querySelector(selector) {
    if (selector !== 'style[data-hold-to-confirm-styles]') return null;
    return (
      this.styles.find((style) =>
        style.attributes.has('data-hold-to-confirm-styles')
      ) || null
    );
  }

  createElement() {
    return new FakeElement(this);
  }
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

test('completes a pointer hold and exposes bound D3 data', async () => {
  const element = new FakeElement();
  element.__data__ = { id: 42 };
  let received;
  holdButton(element, (target, event, data) => {
    received = { target, event, data };
  }, 10);

  const event = element.dispatch('pointerdown');
  assert.equal(event.defaultPrevented, true);
  assert.equal(element.classList.contains('is-holding'), true);

  await wait(20);
  assert.equal(received.target, element);
  assert.equal(received.event, event);
  assert.deepEqual(received.data, { id: 42 });
  assert.equal(element.classList.contains('is-holding'), false);
  assert.equal(element.classList.contains('is-done'), true);
});

test('cancels when released early and can then be held again', async () => {
  const element = new FakeElement();
  const reasons = [];
  let completions = 0;
  const controller = holdButton(element, {
    duration: 15,
    onComplete: () => completions++,
    onCancel: (_element, _event, _data, reason) => reasons.push(reason)
  });

  element.dispatch('pointerdown');
  element.dispatch('pointerup');
  await wait(20);
  assert.equal(completions, 0);
  assert.deepEqual(reasons, ['cancelled']);

  element.dispatch('pointerdown');
  await wait(25);
  assert.equal(completions, 1);

  controller.reset();
  element.dispatch('pointerdown');
  await wait(25);
  assert.equal(completions, 2);
});

test('accepts a D3-shaped selection without importing D3', async () => {
  const elements = [new FakeElement(), new FakeElement()];
  const selection = {
    each(callback) {
      elements.forEach((element, index) => callback.call(element, element.__data__, index));
      return this;
    }
  };
  let completions = 0;
  const controller = holdButton(selection, () => completions++, 5);

  assert.deepEqual(controller.elements, elements);
  elements[1].dispatch('pointerdown');
  await wait(15);
  assert.equal(completions, 1);
});

test('applies options and restores existing appearance on destroy', () => {
  const element = new FakeElement();
  element.style.setProperty('--hold-indicator-color', 'gold');
  element.setAttribute('data-hold-variant', 'custom');

  const controller = holdButton(element, {
    duration: 2400,
    variant: 'danger',
    colors: { indicator: 'tomato', danger: 'pink' }
  });

  assert.equal(element.style.getPropertyValue('--hold-duration'), '2400ms');
  assert.equal(element.style.getPropertyValue('--hold-indicator-color'), 'tomato');
  assert.equal(element.style.getPropertyValue('--hold-danger-color'), 'pink');
  assert.equal(element.getAttribute('data-hold-variant'), 'danger');

  controller.destroy();
  assert.equal(element.style.getPropertyValue('--hold-duration'), '');
  assert.equal(element.style.getPropertyValue('--hold-indicator-color'), 'gold');
  assert.equal(element.style.getPropertyValue('--hold-danger-color'), '');
  assert.equal(element.getAttribute('data-hold-variant'), 'custom');
  assert.equal(element.listeners.get('pointerdown').size, 0);
});

test('supports keyboard holds and ignores disabled controls', async () => {
  const element = new FakeElement();
  let completions = 0;
  holdButton(element, { duration: 5, onComplete: () => completions++ });

  element.disabled = true;
  element.dispatch('keydown', { key: 'Enter' });
  await wait(10);
  assert.equal(completions, 0);

  element.disabled = false;
  element.dispatch('keydown', { key: ' ', repeat: false });
  await wait(15);
  assert.equal(completions, 1);
});

test('Svelte action updates options and destroys listeners', async () => {
  const element = new FakeElement();
  let first = 0;
  let second = 0;
  const action = holdToConfirm(element, {
    duration: 50,
    onComplete: () => first++
  });
  action.update({ duration: 5, onComplete: () => second++ });

  element.dispatch('pointerdown');
  await wait(15);
  assert.equal(first, 0);
  assert.equal(second, 1);

  action.destroy();
  action.reset();
  element.dispatch('pointerdown');
  await wait(10);
  assert.equal(second, 1);
});

test('injects styles only once per document', () => {
  const document = new FakeDocument();
  const first = injectHoldButtonStyles(document);
  const second = injectHoldButtonStyles(document);

  assert.equal(first, second);
  assert.equal(document.styles.length, 1);
  assert.match(first.textContent, /\.hold-btn\.is-holding::before/);
});

test('keeps the injectable and importable styles in sync', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.equal(css.trim(), holdButtonStyles.trim());
});

test('validates duration and callbacks', () => {
  const element = new FakeElement();
  assert.throws(() => holdButton(element, { duration: -1 }), RangeError);
  assert.throws(() => holdButton(element, { onComplete: true }), TypeError);
});
