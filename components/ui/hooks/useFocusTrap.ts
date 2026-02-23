import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]:not([disabled]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',');

interface UseFocusTrapOptions {
  isActive: boolean;
  onEscape?: () => void;
  restoreFocus?: boolean;
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions
) {
  const { isActive, onEscape, restoreFocus = true } = options;
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el: HTMLElement) => el.offsetParent !== null);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive || !containerRef.current) return;

      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [isActive, getFocusableElements]
  );

  useEffect(() => {
    if (isActive) {
      previousActiveElement.current = document.activeElement;

      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        const nonCloseButton = focusableElements.find(
          (el) => !el.getAttribute('aria-label')?.toLowerCase().includes('close')
        );
        (nonCloseButton || focusableElements[0]).focus();
      } else if (containerRef.current) {
        containerRef.current.focus();
      }

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else if (restoreFocus && previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isActive, getFocusableElements, restoreFocus]);

  return containerRef;
}

export default useFocusTrap;
