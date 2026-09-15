import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from './Modal';

global.IS_REACT_ACT_ENVIRONMENT = true;

const renderModal = (props = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <Modal isOpen title="Test modal" onClose={props.onClose} {...props}>
        <button type="button">Modal action</button>
      </Modal>,
    );
  });

  return {
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe('Modal dismissal behavior', () => {
  afterEach(() => {
    document.querySelectorAll('.modal-overlay').forEach((node) => node.remove());
  });

  test('keeps the existing overlay and Escape behavior by default', () => {
    const onClose = jest.fn();
    const { cleanup } = renderModal({ onClose });

    act(() => {
      document.querySelector('.modal-overlay').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('protected edit modal closes only from its explicit close control', () => {
    const onClose = jest.fn();
    const { cleanup } = renderModal({
      onClose,
      closeOnEscape: false,
      closeOnOverlay: false,
    });

    act(() => {
      document.querySelector('.modal-overlay').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      document.querySelector('.modal-close').click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
