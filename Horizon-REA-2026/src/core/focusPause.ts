/** The window can lose focus while the user takes a screenshot or visits
 * another tab. Keep an intentional manual pause, but recover automatically
 * from a pause caused solely by losing focus. */
export function shouldResumeFromFocusLoss(
  automaticallyPaused: boolean,
  pageHidden: boolean,
  windowFocused: boolean
): boolean {
  return automaticallyPaused && !pageHidden && windowFocused;
}
