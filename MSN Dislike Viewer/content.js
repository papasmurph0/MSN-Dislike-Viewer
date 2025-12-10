// /*
//   MSN Dislike Viewer - Deep Shadow DOM Support
// */

const processedIds = new Set();

/**
 * 1. API: Fetch dislike count
 */
async function fetchDislikeCount(articleId) {
  try {
    const url = `https://assets.msn.com/service/community/urls/?cmsid=${articleId}&market=${navigator.language}`;
    const response = await fetch(url);
    const data = await response.json();

    // MSN API structure traversal
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

  // Add CSS if not present
  if (root instanceof ShadowRoot || root instanceof Document) {
    if (!root.querySelector("#dislike-viewer-styles")) {
      const style = document.createElement("style");
      style.id = "dislike-viewer-styles";

      // ORIGINAL STYLING
      style.textContent = `
         button[part="button-bg downvote"] {
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
         }
       `;
      root.appendChild(style);
    }
  }

  // Add/Update the Badge Element
  let badge = button.querySelector(".dislike-count-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "dislike-count-badge";
    button.appendChild(badge);
  }
  badge.textContent = count;
}

/**
 * 3. Deep Finder: Recursively searches Shadow DOMs
 */
function findDownvoteButton(root) {
  if (!root) return null;

  // 1. Check if the current element IS the button
  if (root.matches && root.matches('button[part*="downvote"]')) {
    return root;
  }

  // 2. Search inside Shadow DOM (if it exists)
  if (root.shadowRoot) {
    const found = findDownvoteButton(root.shadowRoot);
    if (found) return found;
  }

  // 3. Search children (Standard DOM)
  if (root.children) {
    for (let i = 0; i < root.children.length; i++) {
      const found = findDownvoteButton(root.children[i]);
      if (found) return found;
    }
  }

  return null;
}

/**
 * 4. Processor: Handles a specific Article Wrapper
 */
async function processArticleWrapper(wrapper) {
  const wrapperId = wrapper.id;

  // Basic check for MSN ID format
  if (!wrapperId || !wrapperId.startsWith("ViewsPageId-")) return;

  const articleId = wrapperId.split("-").pop();

  // FIX: Filter out "observer" or short invalid IDs that aren't real articles
  if (articleId === "observer" || articleId.length < 4) return;

  // Prevent duplicate API calls
  if (processedIds.has(wrapperId)) return;

  let count = "0";
  if (!wrapper.dataset.dislikesFetched) {
      console.log(`New Article Detected: ${articleId}`);
    count = await fetchDislikeCount(articleId);
    wrapper.dataset.dislikesFetched = "true";
      wrapper.dataset.dislikeCount = count;
      console.log(`Dislikes: ${count}`);
    processedIds.add(wrapperId);
  } else {
    count = wrapper.dataset.dislikeCount;
  }

  // Retry finding the button for a few seconds (Shadow DOMs lazy load)
  let attempts = 0;
  const maxAttempts = 15;

  const poll = setInterval(() => {
    attempts++;
    const btn = findDownvoteButton(wrapper);

    if (btn) {
      injectBadge(btn, count);
      console.log(`Badge applied to ${wrapperId}`);
      clearInterval(poll);
    } else if (attempts >= maxAttempts) {
      clearInterval(poll);
    }
  }, 1000);
}

/**
 * 5. Main Observer: Watch for scrolling/new content
 */
function startObserver() {
  const bodyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // Direct check
          if (node.id && node.id.startsWith("ViewsPageId-")) {
            processArticleWrapper(node);
          }
          // Deep check (if articles are wrapped in a container)
          else {
            const nestedArticles = node.querySelectorAll?.(
              'div[id^="ViewsPageId-"]'
            );
            if (nestedArticles) {
              nestedArticles.forEach(processArticleWrapper);
            }
          }
        }
      }
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Process existing
  document
    .querySelectorAll('div[id^="ViewsPageId-"]')
    .forEach(processArticleWrapper);
  console.log("MSN Dislike Viewer: Observer Started");
}

startObserver();

// Handle Back/Forward Navigation
window.addEventListener("popstate", () => {
  setTimeout(() => {
    document
      .querySelectorAll('div[id^="ViewsPageId-"]')
      .forEach(processArticleWrapper);
  }, 2000);
});
