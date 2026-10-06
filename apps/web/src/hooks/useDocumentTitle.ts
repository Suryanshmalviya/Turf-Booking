import { useEffect } from 'react';

const BASE_TITLE = 'Pickleball Booking';

/** Keep the document title in sync with the page being viewed. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
  }, [title]);
}