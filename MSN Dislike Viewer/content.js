// /*
//   MSN Dislike Viewer - Deep Shadow DOM Support
// */

const activePolls = new WeakMap();

/**
 * 1. API: Fetch dislike count
 */
async function fetchDislikeCount(articleId) {
  try {
    const url = `https://assets.msn.com/service/community/urls/?cmsid=${articleId}&market=${navigator.language}`;
    const response = await fetch(url);
    const data = await response.json();

    const reactions = data?.value?.[0]?.reactionSummary?.subReactionSummaries;
    if (reactions) {
      const downvote = reactions.find((item) => item.type === "Downvote");
      return downvote ? String(downvote.totalCount) : "0";
    }
  } catch (error) {
    // console.warn("Error fetching dislikes:", error);
  }

  return "0";
}

/**
 * 2. Visuals: Inject the Badge with Original Styles
 */
function injectBadge(button, count) {
  const root = button.getRootNode();

  if (root instanceof ShadowRoot || root instanceof Document) {
    if (!root.querySelector("#dislike-viewer-styles")) {
      const style = document.createElement("style");
      style.id = "dislike-viewer-styles";
      style.textContent = `
        button[part*="downvote"] {
          position: relative !important;
          overflow: visible !important;
        }

        .dislike-count-badge {
          font-size: 10px;
          position: absolute;
          top: -10px;
          right: -35%;
          background: var(--accent-fill-rest, #0078d4);
          width: max-content;
          min-width: 10px;
          border-radius: 16px;
          padding: 4px 6px;
          color: var(--foreground-on-accent-rest, white);
          text-align: center;
          z-index: 1;
          pointer-events: none;
          line-height: 1;
          white-space: nowrap;
        }
      `;
      root.appendChild(style);
    }
  }

  let badge = button.querySelector(".dislike-count-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "dislike-count-badge";
    badge.setAttribute("aria-live", "polite");
    button.appendChild(badge);
  }

  if (badge.textContent !== count) {
    badge.textContent = count;
  }
}

/**
 * 3. Deep Finder: Recursively searches Shadow DOMs
 */
function findDownvoteButton(root) {
  if (!root) return null;

  if (root.matches && root.matches('button[part*="downvote"]')) {
    return root;
  }

  if (root.shadowRoot) {
    const found = findDownvoteButton(root.shadowRoot);
    if (found) return found;
  }

  if (root.children) {
    for (let i = 0; i < root.children.length; i++) {
      const found = findDownvoteButton(root.children[i]);
      if (found) return found;
    }
  }

  return null;
}

function getArticleId(wrapper) {
  const wrapperId = wrapper?.id;
  if (!wrapperId || !wrapperId.startsWith("ViewsPageId-")) return null;

  const articleId = wrapperId.split("-").pop();
  if (articleId === "observer" || articleId.length < 4) return null;

  return articleId;
}

async function ensureDislikeData(wrapper) {
  const articleId = getArticleId(wrapper);
  if (!articleId) return null;

  if (wrapper.dataset.dislikesFetched === "true") {
    return wrapper.dataset.dislikeCount || "0";
  }

  if (wrapper.dataset.dislikesFetching === "true") {
    return null;
  }

  wrapper.dataset.dislikesFetching = "true";

  try {
    const count = await fetchDislikeCount(articleId);
    wrapper.dataset.dislikesFetched = "true";
    wrapper.dataset.dislikeCount = count;
    return count;
  } finally {
    delete wrapper.dataset.dislikesFetching;
  }
}

function tryApplyBadge(wrapper) {
  if (!(wrapper instanceof Element)) return false;

  const count = wrapper.dataset.dislikeCount;
  if (typeof count !== "string") return false;

  const btn = findDownvoteButton(wrapper);
  if (!btn) return false;

  injectBadge(btn, count);
  wrapper.dataset.dislikeBadgeApplied = "true";
  return true;
}

function clearScheduledPoll(wrapper) {
  const poll = activePolls.get(wrapper);
  if (poll) {
    clearInterval(poll);
    activePolls.delete(wrapper);
  }
}

function scheduleBadgeRetry(wrapper) {
  if (!(wrapper instanceof Element)) return;
  if (activePolls.has(wrapper)) return;

  let attempts = 0;
  const maxAttempts = 80;

  const poll = setInterval(() => {
    if (!wrapper.isConnected) {
      clearScheduledPoll(wrapper);
      return;
    }

    attempts++;

    if (tryApplyBadge(wrapper)) {
      clearScheduledPoll(wrapper);
      return;
    }

    if (attempts >= maxAttempts) {
      clearScheduledPoll(wrapper);
    }
  }, 100);

  activePolls.set(wrapper, poll);
}

/**
 * 4. Processor: Handles a specific Article Wrapper
 */
async function processArticleWrapper(wrapper) {
  if (!(wrapper instanceof Element)) return;

  const articleId = getArticleId(wrapper);
  if (!articleId) return;

  await ensureDislikeData(wrapper);

  if (!tryApplyBadge(wrapper)) {
    scheduleBadgeRetry(wrapper);
  } else {
    clearScheduledPoll(wrapper);
  }
}

function findArticleWrapperFromNode(node) {
  if (!(node instanceof Element)) return null;

  if (node.id && node.id.startsWith("ViewsPageId-")) {
    return node;
  }

  return node.closest?.('div[id^="ViewsPageId-"]') || null;
}

function processAllVisibleArticles() {
  document
    .querySelectorAll('div[id^="ViewsPageId-"]')
    .forEach(processArticleWrapper);
}

/**
 * 5. Main Observer: Watch for scrolling/new content/hydration
 */
function startObserver() {
  const bodyObserver = new MutationObserver((mutations) => {
    const wrappers = new Set();

    for (const mutation of mutations) {
      const mutationTargetWrapper = findArticleWrapperFromNode(mutation.target);
      if (mutationTargetWrapper) {
        wrappers.add(mutationTargetWrapper);
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        const directWrapper = findArticleWrapperFromNode(node);
        if (directWrapper) {
          wrappers.add(directWrapper);
        }

        const nestedArticles = node.querySelectorAll?.('div[id^="ViewsPageId-"]');
        nestedArticles?.forEach((article) => wrappers.add(article));
      }
    }

    wrappers.forEach((wrapper) => {
      processArticleWrapper(wrapper);
    });
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  processAllVisibleArticles();
  console.log("MSN Dislike Viewer: Observer Started");
}


function initWhenReady() {
  if (!document.body) {
    setTimeout(initWhenReady, 50);
    return;
  }

  startObserver();
  setTimeout(processAllVisibleArticles, 250);
  setTimeout(processAllVisibleArticles, 1000);
  setTimeout(processAllVisibleArticles, 2500);
}

initWhenReady();

window.addEventListener("popstate", () => {
  setTimeout(processAllVisibleArticles, 250);
  setTimeout(processAllVisibleArticles, 1000);
});

window.addEventListener("pageshow", () => {
  setTimeout(processAllVisibleArticles, 250);
  setTimeout(processAllVisibleArticles, 1000);
});
