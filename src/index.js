import { holdButtonStyles, injectHoldButtonStyles } from './styles.js';

const DEFAULTS = Object.freeze({
  duration: 1000,
  injectStyles: true,
  keyboard: true,
  variant: undefined,
  colors: undefined,
  onComplete: undefined,
  onStart: undefined,
  onCancel: undefined
});

const COLOR_PROPERTIES = Object.freeze({
  progress: '--hold-progress-color',
  danger: '--hold-danger-color',
  success: '--hold-success-color',
  indicator: '--hold-indicator-color',
  surface: '--hold-surface-color'
});

function isElementLike(value) {
  return Boolean(value && typeof value.addEventListener === 'function');
}

function resolveElements(targets) {
  if (typeof targets === 'string') {
    if (!globalThis.document?.querySelectorAll) {
      throw new TypeError('A selector can only be used in a browser document.');
    }
    return [...globalThis.document.querySelectorAll(targets)];
  }

  if (isElementLike(targets)) return [targets];

  // D3 selections expose each(), and invoke its callback with the element as
  // `this`. No D3 import is needed.
  if (targets && typeof targets.each === 'function') {
    const elements = [];
    targets.each(function collectElement() {
      if (isElementLike(this)) elements.push(this);
    });
    return elements;
  }

  if (targets && typeof targets[Symbol.iterator] === 'function') {
    return [...targets].filter(isElementLike);
  }

  throw new TypeError(
    'Expected an Element, selector, iterable of Elements, or D3 selection.'
  );
}

function normalizeOptions(onCompleteOrOptions, durationOrOptions) {
  let options;

  if (typeof onCompleteOrOptions === 'function' || onCompleteOrOptions == null) {
    const extra =
      typeof durationOrOptions === 'number'
        ? { duration: durationOrOptions }
        : durationOrOptions || {};
    options = { ...extra, onComplete: onCompleteOrOptions || extra.onComplete };
  } else {
    options = { ...onCompleteOrOptions };
  }

  const normalized = { ...DEFAULTS, ...options };
  if (!Number.isFinite(normalized.duration) || normalized.duration < 0) {
    throw new RangeError('duration must be a finite, non-negative number.');
  }

  for (const callback of ['onComplete', 'onStart', 'onCancel']) {
    if (normalized[callback] != null && typeof normalized[callback] !== 'function') {
      throw new TypeError(`${callback} must be a function.`);
    }
  }

  return normalized;
}

function isUnavailable(element) {
  return Boolean(
    element.disabled || element.getAttribute?.('aria-disabled') === 'true'
  );
}

function rememberAppearance(element) {
  return {
    hadBaseClass: element.classList.contains('hold-btn'),
    variant: element.getAttribute?.('data-hold-variant'),
    duration: element.style?.getPropertyValue('--hold-duration') || '',
    colors: Object.fromEntries(
      Object.values(COLOR_PROPERTIES).map((property) => [
        property,
        element.style?.getPropertyValue(property) || ''
      ])
    )
  };
}

function restoreProperty(style, property, value) {
  if (!style) return;
  if (value) style.setProperty(property, value);
  else style.removeProperty(property);
}

function applyAppearance(item, options) {
  const { element, original } = item;
  element.classList.add('hold-btn');
  element.style?.setProperty('--hold-duration', `${options.duration}ms`);

  for (const [name, property] of Object.entries(COLOR_PROPERTIES)) {
    restoreProperty(
      element.style,
      property,
      options.colors?.[name] ?? original.colors[property]
    );
  }

  if (options.variant != null) {
    element.setAttribute?.('data-hold-variant', options.variant);
  } else if (original.variant == null) {
    element.removeAttribute?.('data-hold-variant');
  } else {
    element.setAttribute?.('data-hold-variant', original.variant);
  }
}

function restoreAppearance(item) {
  const { element, original } = item;
  if (!original.hadBaseClass) element.classList.remove('hold-btn');
  element.classList.remove('is-holding', 'is-done');
  restoreProperty(element.style, '--hold-duration', original.duration);

  for (const [property, value] of Object.entries(original.colors)) {
    restoreProperty(element.style, property, value);
  }

  if (original.variant == null) {
    element.removeAttribute?.('data-hold-variant');
  } else {
    element.setAttribute?.('data-hold-variant', original.variant);
  }
}

/**
 * Attach hold-to-confirm behavior to DOM elements.
 *
 * Legacy-compatible form:
 *   holdButton(elements, onComplete, 1200)
 *
 * Options form:
 *   holdButton(elements, { duration: 1200, onComplete, variant: 'danger' })
 */
export function holdButton(targets, onCompleteOrOptions, durationOrOptions) {
  const elements = resolveElements(targets);
  let options = normalizeOptions(onCompleteOrOptions, durationOrOptions);
  let destroyed = false;

  const items = elements.map((element) => ({
    element,
    original: rememberAppearance(element),
    timer: null,
    active: false,
    done: false,
    startEvent: null,
    listeners: []
  }));

  for (const doc of new Set(elements.map((element) => element.ownerDocument))) {
    if (options.injectStyles) injectHoldButtonStyles(doc);
  }

  const cancel = (item, event, reason = 'cancelled', notify = true) => {
    if (!item.active) return;
    clearTimeout(item.timer);
    item.timer = null;
    item.active = false;
    item.element.classList.remove('is-holding');
    if (!item.done && notify) {
      options.onCancel?.(item.element, event, item.element.__data__, reason);
    }
  };

  const complete = (item) => {
    if (!item.active || item.done || destroyed) return;
    item.active = false;
    item.timer = null;
    item.done = true;
    item.element.classList.remove('is-holding');
    item.element.classList.add('is-done');
    options.onComplete?.(
      item.element,
      item.startEvent,
      item.element.__data__
    );
  };

  const start = (item, event) => {
    if (destroyed || item.active || item.done || isUnavailable(item.element)) return;
    if (event.type === 'pointerdown') {
      if (event.button != null && event.button !== 0) return;
      if (event.isPrimary === false) return;
    }

    event.preventDefault?.();
    item.active = true;
    item.startEvent = event;
    item.element.classList.add('is-holding');
    options.onStart?.(item.element, event, item.element.__data__);
    item.timer = setTimeout(() => complete(item), options.duration);
  };

  const listen = (item, type, listener) => {
    item.element.addEventListener(type, listener);
    item.listeners.push([type, listener]);
  };

  for (const item of items) {
    applyAppearance(item, options);

    listen(item, 'pointerdown', (event) => start(item, event));
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      listen(item, type, (event) => cancel(item, event));
    }
    listen(item, 'contextmenu', (event) => event.preventDefault?.());
    listen(item, 'keydown', (event) => {
      if (
        options.keyboard &&
        !event.repeat &&
        (event.key === ' ' || event.key === 'Enter')
      ) {
        start(item, event);
      }
    });
    listen(item, 'keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') cancel(item, event);
    });
    listen(item, 'blur', (event) => cancel(item, event, 'blurred'));
  }

  const controller = {
    elements,

    reset(elementsToReset = elements) {
      const requested = new Set(
        isElementLike(elementsToReset) ? [elementsToReset] : elementsToReset
      );
      for (const item of items) {
        if (!requested.has(item.element)) continue;
        cancel(item, undefined, 'reset', false);
        item.done = false;
        item.startEvent = null;
        item.element.classList.remove('is-holding', 'is-done');
      }
      return controller;
    },

    update(nextOptions = {}) {
      if (destroyed) return controller;
      for (const item of items) cancel(item, undefined, 'updated', false);
      options = normalizeOptions({ ...options, ...nextOptions });
      for (const item of items) applyAppearance(item, options);

      if (options.injectStyles) {
        for (const doc of new Set(elements.map((element) => element.ownerDocument))) {
          injectHoldButtonStyles(doc);
        }
      }
      return controller;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const item of items) {
        cancel(item, undefined, 'destroyed', false);
        for (const [type, listener] of item.listeners) {
          item.element.removeEventListener(type, listener);
        }
        restoreAppearance(item);
      }
    }
  };

  return controller;
}

/**
 * Svelte action. Usage:
 *   <button use:holdToConfirm={{ onComplete: removeItem }}>Delete</button>
 */
export function holdToConfirm(node, parameters = {}) {
  const controller = holdButton(node, parameters);
  return {
    update(nextParameters) {
      // Svelte action parameters are replacement values rather than patches.
      controller.update({ ...DEFAULTS, ...(nextParameters || {}) });
    },
    destroy() {
      controller.destroy();
    },
    reset() {
      controller.reset();
    }
  };
}

export { holdButtonStyles, injectHoldButtonStyles };
export default holdButton;
