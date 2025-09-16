/*
  MSN Dislike Viewer - Article-Only Version
  This script finds the dislike button on news articles and injects a styled
  badge that matches the look of the like/comment counts.
*/

// A Set to keep track of elements we've already processed to prevent duplicate work.
const processedButtons = new Set();
let observer = null; // To hold our MutationObserver instance.

/**
 * Updates or creates the dislike count badge on the button.
 * @param {HTMLElement} dislikeButton - The button element to update.
 */
function updateDislikeBadge(dislikeButton) {
    try {
        const ariaLabel = dislikeButton.getAttribute('aria-label');
        if (!ariaLabel) return;

        // This regex captures numbers, decimals, and the 'k' character.
        const countMatch = ariaLabel.match(/[\d.,]+k?/i);
        const dislikeCount = countMatch ? countMatch[0] : "0";

        // Find an existing badge or create a new one.
        let countDisplay = dislikeButton.querySelector('.dislike-count-badge');
        if (!countDisplay) {
            countDisplay = document.createElement('span');
            countDisplay.className = 'dislike-count-badge'; // Matches the class in the CSS
            dislikeButton.appendChild(countDisplay);
        }

        // Update the text content of the badge.
        countDisplay.textContent = dislikeCount;
    } catch (error) {
        // Fail silently.
    }
}


/**
 * Sets up the MutationObserver to watch for real-time changes.
 * @param {HTMLElement} dislikeButton - The button element to observe.
 */
function observeDislikeButton(dislikeButton) {
    // Define what the observer should do when a mutation is detected.
    const callback = (mutationsList) => {
        for (const mutation of mutationsList) {
            // We only care about changes to the 'aria-label' attribute.
            if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
                updateDislikeBadge(mutation.target); // Re-run the badge update logic.
            }
        }
    };

    // Create and configure the observer.
    observer = new MutationObserver(callback);
    observer.observe(dislikeButton, {
        attributes: true // This is essential to monitor attribute changes.
    });
}


/**
 * The main function that finds the elements and sets everything up.
 */
function initialSetup() {
    try {
        // This path is specific and reliable for article pages.
        const actionTray = document.querySelector('action-tray');
        if (!actionTray || !actionTray.shadowRoot) return;

        const reactionsButton = actionTray.shadowRoot.querySelector('msn-at-reactions-button');
        if (!reactionsButton || !reactionsButton.shadowRoot) return;

        const socialBarWc = reactionsButton.shadowRoot.querySelector('social-bar-wc');
        if (!socialBarWc || !socialBarWc.shadowRoot) return;

        const msnSocialBar = socialBarWc.shadowRoot.querySelector('msn-social-bar');
        if (!msnSocialBar || !msnSocialBar.shadowRoot) return;

        const finalShadowRoot = msnSocialBar.shadowRoot;
        const dislikeButton = finalShadowRoot.querySelector('button[part="button-bg downvote"]');

        // If we found the button and haven't already processed it...
        if (dislikeButton && !processedButtons.has(dislikeButton)) {

            // Inject the necessary CSS styles directly into this shadow DOM.
            if (!finalShadowRoot.querySelector('#dislike-viewer-styles')) {
                const style = document.createElement('style');
                style.id = 'dislike-viewer-styles';
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
                finalShadowRoot.appendChild(style);
            }

            // Perform the initial update of the badge.
            updateDislikeBadge(dislikeButton);

            // Set up the observer for real-time updates.
            observeDislikeButton(dislikeButton);

            // Mark this button as processed to prevent setting up multiple observers.
            processedButtons.add(dislikeButton);

            // We can now stop the interval since we found what we needed.
            if (setupInterval) {
                clearInterval(setupInterval);
            }
        }
    } catch (error) {
        // Fail silently if the page structure changes.
    }
}

// Poll the page until the dislike button is found, then stop.
const setupInterval = setInterval(initialSetup, 750);