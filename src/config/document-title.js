const applicationTitle = "SIGECOM";

export function lockApplicationTitle(targetDocument = document) {
  const MutationObserver = targetDocument.defaultView?.MutationObserver;

  if (!targetDocument.head || !MutationObserver) return () => {};

  const enforceTitle = () => {
    if (targetDocument.title !== applicationTitle) {
      targetDocument.title = applicationTitle;
    }
  };

  enforceTitle();

  const observer = new MutationObserver(enforceTitle);
  observer.observe(targetDocument.head, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
