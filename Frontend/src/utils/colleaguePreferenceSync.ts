export const COLLEAGUE_SELECTIONS_EVENT = 'odin:colleague-selections-changed';

export type ColleagueSelectionsDetail = {
  preferred: string[];
  avoid: string[];
};

export function dispatchColleagueSelections(detail: ColleagueSelectionsDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ColleagueSelectionsDetail>(COLLEAGUE_SELECTIONS_EVENT, { detail }));
}

export function listenColleagueSelections(
  listener: (detail: ColleagueSelectionsDetail) => void,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<ColleagueSelectionsDetail>).detail;
    listener(detail || { preferred: [], avoid: [] });
  };

  window.addEventListener(COLLEAGUE_SELECTIONS_EVENT, handleEvent);
  return () => window.removeEventListener(COLLEAGUE_SELECTIONS_EVENT, handleEvent);
}