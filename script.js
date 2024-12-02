// script.js

// =========================
// Configuration and Setup
// =========================

// API Keys (⚠️ IMPORTANT: For security reasons, move these to a backend server in production)
const scrapingBeeApiKey = 'YOUR_SCRAPINGBEE_API_KEY';
const openAiApiKey = 'YOUR_OPENAI_API_KEY';
const scraperApiKey = 'YOUR_SCRAPERAPI_KEY';

// DOM Elements
const businessNameInput = document.getElementById('businessName');
const businessDetailsInput = document.getElementById('businessDetails');
const toneOfVoiceInput = document.getElementById('toneOfVoice');
const desiredLengthInput = document.getElementById('desiredLength');
const domainInput = document.getElementById('domain');
const getLinksButton = document.querySelector('.link-extractor .btn-primary');
const loadingIndicator = document.getElementById('loading');
const errorMessage = document.getElementById('error');
const linksList = document.getElementById('linksList');
const selectAllButton = document.getElementById('selectAllButton');
const extractButton = document.getElementById('extractButton');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const textContentSection = document.getElementById('textContent');
const finalPromptText = document.getElementById('finalPromptText');
const enhanceFinalPromptButton = document.querySelector('#finalPrompt .btn-primary');
const copyFinalPromptButton = document.querySelector('#finalPrompt .btn-secondary');
const systemPromptTextarea = document.getElementById('systemPrompt');
const temperatureInputPlayground = document.getElementById('temperature');
const maxTokensInputPlayground = document.getElementById('maxTokens');
const conversationDiv = document.getElementById('conversation');
const userInputTextarea = document.getElementById('userInput');
const sendMessageButton = document.getElementById('sendMessage');

// =========================
// Utility Functions
// =========================

/**
 * Ensures the URL starts with HTTPS. If not, prepends it.
 * @param {string} url - The URL to check.
 * @returns {string} - The HTTPS URL.
 */
function ensureHttps(url) {
    return url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
}

/**
 * Saves the final prompt to local storage.
 */
function saveFinalPrompt() {
    const finalPrompt = finalPromptText.value;
    localStorage.setItem('finalPromptText', finalPrompt);
}

/**
 * Loads the final prompt from local storage.
 */
function loadFinalPrompt() {
    const storedPrompt = localStorage.getItem('finalPromptText');
    if (storedPrompt) {
        finalPromptText.value = storedPrompt;
    }
}

/**
 * Debounces a function to limit how often it can be called.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
function debounce(func, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// =========================
// Local Storage Initialization
// =========================

document.addEventListener('DOMContentLoaded', () => {
    // Load the final prompt from local storage
    loadFinalPrompt();

    // Initialize event listeners for configuration inputs
    const configInputs = [businessNameInput, businessDetailsInput, toneOfVoiceInput, desiredLengthInput];
    configInputs.forEach(input => {
        input.addEventListener('input', debounce(updateFinalPrompt));
    });

    // Initialize the conversation area with flex layout
    conversationDiv.style.display = 'flex';
    conversationDiv.style.flexDirection = 'column';
});

// =========================
// Final Prompt Management
// =========================

/**
 * Updates the final prompt based on user configurations and added content.
 */
function updateFinalPrompt() {
    const businessName = businessNameInput.value.trim();
    const businessDetails = businessDetailsInput.value.trim();
    const toneOfVoice = toneOfVoiceInput.value.trim();
    const desiredLength = desiredLengthInput.value.trim();

    let configText = 'Chatbot Configuration:\n';
    if (businessName) configText += `Business Name: ${businessName}\n`;
    if (businessDetails) configText += `Business Details: ${businessDetails}\n`;
    if (toneOfVoice) configText += `Tone of Voice: ${toneOfVoice}\n`;
    if (desiredLength) configText += `Target Line Count for Responses: ${desiredLength}\n`;

    // Extract existing content without Chatbot Configuration
    let content = finalPromptText.value;
    const configStartIndex = content.indexOf('Chatbot Configuration:');
    const configEndIndex = content.indexOf('\n\n', configStartIndex);

    if (configStartIndex !== -1 && configEndIndex !== -1) {
        content = content.slice(configEndIndex).trim();
    }

    // Reconstruct the final prompt
    let updatedContent = `${configText}\n${content}`;
    finalPromptText.value = updatedContent.trim();

    // Save the updated prompt to local storage
    saveFinalPrompt();
}

// =========================
// Link Extraction and Parsing
// =========================

/**
 * Fetches site links using ScrapingBee or ScraperAPI.
 */
async function fetchSiteLinks() {
    const domain = ensureHttps(domainInput.value);
    if (!domain) {
        displayError('Please enter a valid domain.');
        return;
    }

    // Show loading indicator and hide previous results
    loadingIndicator.style.display = 'block';
    errorMessage.style.display = 'none';
    linksList.innerHTML = '';
    extractButton.style.display = 'none';
    selectAllButton.style.display = 'none';

    try {
        let sitemapContent;
        try {
            // Attempt to fetch sitemap using ScrapingBee
            const sitemapUrl = `${domain}/sitemap.xml`;
            sitemapContent = await fetchWithScrapingBee(sitemapUrl);
            const urls = await parseSitemaps(sitemapContent);

            if (urls.length === 0) throw new Error('No URLs found in the sitemap.');

            // Populate links list
            urls.forEach(url => {
                const li = document.createElement('li');
                li.innerHTML = `<label><input type="checkbox" value="${url}"> <span>${url}</span></label>`;
                linksList.appendChild(li);
            });

            // Show buttons
            extractButton.style.display = 'block';
            selectAllButton.style.display = 'block';
        } catch (primaryError) {
            console.warn('ScrapingBee failed, attempting with ScraperAPI...', primaryError);
            // Fallback to ScraperAPI for direct content extraction
            const pageContent = await fetchWithScraperApi(domain);
            const text = extractTextFromHtml(pageContent, domain);
            const pageSection = createPageSection(domain, text);
            textContentSection.appendChild(pageSection);
            updateFinalPrompt();
        }
    } catch (error) {
        displayError(error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

/**
 * Parses sitemap XML content and extracts URLs.
 * @param {string} sitemapContent - The sitemap XML content.
 * @returns {Array<string>} - Array of extracted URLs.
 */
async function parseSitemaps(sitemapContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
    const urls = [];

    const sitemapNodes = xmlDoc.getElementsByTagName('sitemap');
    if (sitemapNodes.length > 0) {
        // Handle sitemap index
        for (let i = 0; i < sitemapNodes.length; i++) {
            const sitemapLoc = sitemapNodes[i].getElementsByTagName('loc')[0]?.textContent?.trim();
            if (sitemapLoc) {
                const subSitemapContent = await fetchWithScrapingBee(sitemapLoc);
                const subUrls = await parseSitemaps(subSitemapContent);
                urls.push(...subUrls);
            }
        }
    } else {
        // Handle single sitemap
        const locNodes = xmlDoc.getElementsByTagName('loc');
        for (let i = 0; i < locNodes.length; i++) {
            const url = locNodes[i].textContent.trim();
            if (url) urls.push(url);
        }
    }

    return urls;
}

/**
 * Toggles the selection of all checkboxes in the links list.
 */
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('#linksList input[type="checkbox"]');
    const selectAll = selectAllButton.textContent.includes('Select');
    checkboxes.forEach(cb => cb.checked = selectAll);
    selectAllButton.textContent = selectAll ? 'Deselect All' : 'Select All';
}

/**
 * Extracts content from selected URLs and displays them.
 */
async function extractSelectedContent() {
    const selectedCheckboxes = document.querySelectorAll('#linksList input[type="checkbox"]:checked');
    const selectedUrls = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedUrls.length === 0) {
        alert('Please select at least one link to extract content from.');
        return;
    }

    // Show loading and progress
    loadingIndicator.style.display = 'block';
    errorMessage.style.display = 'none';
    textContentSection.innerHTML = '';
    progressBar.style.width = '0%';
    progressText.textContent = '';
    progressText.parentElement.style.display = 'block';

    try {
        for (let i = 0; i < selectedUrls.length; i++) {
            const url = selectedUrls[i];
            const pageContent = await fetchWithScrapingBee(url);
            const originalDomain = new URL(url).origin;
            const text = extractTextFromHtml(pageContent, originalDomain);
            const pageSection = createPageSection(url, text);
            textContentSection.appendChild(pageSection);

            // Update progress
            const progressPercent = ((i + 1) / selectedUrls.length) * 100;
            progressBar.style.width = `${progressPercent}%`;
            progressText.textContent = `Processing ${i + 1} of ${selectedUrls.length}`;
        }
        updateFinalPrompt();
    } catch (error) {
        displayError(error.message);
    } finally {
        loadingIndicator.style.display = 'none';
        progressText.parentElement.style.display = 'none';
    }
}

/**
 * Creates a page section element with extracted text and action buttons.
 * @param {string} url - The URL of the page.
 * @param {string} text - The extracted text content.
 * @returns {HTMLElement} - The created page section element.
 */
function createPageSection(url, text) {
    const section = document.createElement('div');
    section.className = 'page-section';
    section.innerHTML = `
        <h3>${url}</h3>
        <p>${text}</p>
        <div class="button-group">
            <button class="btn-primary enhance-button" onclick="enhanceText(this)"><i class="fas fa-edit"></i> Enhance</button>
            <button class="btn-secondary combine-button" onclick="addToFinalPrompt(this)"><i class="fas fa-plus-circle"></i> Add to Final Prompt</button>
        </div>
    `;
    return section;
}

/**
 * Extracts and cleans text from HTML content.
 * @param {string} html - The HTML content.
 * @param {string} originalDomain - The original domain for resolving relative URLs.
 * @returns {string} - The cleaned text content.
 */
function extractTextFromHtml(html, originalDomain) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove unwanted tags
    ['script', 'style', 'noscript', 'meta', 'link', 'header', 'nav', 'aside'].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Resolve relative URLs
    doc.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            try {
                const absoluteUrl = new URL(href, originalDomain).href;
                link.textContent = absoluteUrl;
                link.setAttribute('href', absoluteUrl);
            } catch (e) {
                console.warn(`Invalid URL found: ${href}`);
                link.removeAttribute('href');
            }
        }
    });

    doc.querySelectorAll('img, video').forEach(el => {
        const src = el.getAttribute('src');
        if (src) {
            try {
                const absoluteUrl = new URL(src, originalDomain).href;
                el.setAttribute('src', absoluteUrl);
            } catch (e) {
                console.warn(`Invalid media source found: ${src}`);
                el.removeAttribute('src');
            }
        }
    });

    // Convert links to plain text
    let text = doc.body.innerHTML.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/g, '$1');

    // Remove all HTML tags and clean up whitespace
    const cleanText = text.replace(/<[^>]*>/g, ' ')
                          .replace(/&nbsp;/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();

    return cleanText;
}

/**
 * Displays an error message to the user.
 * @param {string} message - The error message to display.
 */
function displayError(message) {
    errorMessage.textContent = `Error: ${message}`;
    errorMessage.style.display = 'block';
}

// =========================
// Content Enhancement
// =========================

/**
 * Enhances the extracted text using OpenAI's GPT-4o-mini model.
 * @param {HTMLElement} button - The button that was clicked.
 */
async function enhanceText(button) {
    const section = button.closest('.page-section');
    const url = section.querySelector('h3').textContent;
    const text = section.querySelector('p').textContent;

    // Disable button and show loading state
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enhancing...';

    const messages = [
        {
            role: "system",
            content: "You are an AI assistant optimizing content for a chatbot knowledge base. Enhance and optimize the following content to make it detailed, structured, and suitable for use in a chatbot. Ensure the text is clear, informative, and well-organized. Retain any links, images, and videos, and format them appropriately. Do not use ### or * in your response for formatting or any other purpose. Keep things well organized and ONLY use plain text."
        },
        {
            role: "user",
            content: `Content to enhance in plain text without any # or *. Always use just plain text and make sure non-clickable URLs are always in a list on their own separate lines:\n\n${text}\n\nOptimized content:`
        }
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                max_tokens: 4096, // Maximum tokens for GPT-4o-mini
                temperature: 0.7,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            })
        });

        if (!response.ok) throw new Error(`Failed to enhance text. Status: ${response.status}`);

        const result = await response.json();
        const enhancedText = result.choices[0].message.content.trim();

        // Update the paragraph with enhanced text
        section.querySelector('p').textContent = enhancedText;

        // Update button state
        button.innerHTML = '<i class="fas fa-check-circle"></i> Enhanced';

        // Update the final prompt and save to local storage
        updateFinalPrompt();

        alert('Text enhanced successfully!');
    } catch (error) {
        console.error('Error enhancing text:', error);
        alert('Error enhancing text: ' + error.message);
        button.innerHTML = '<i class="fas fa-edit"></i> Enhance';
    } finally {
        button.disabled = false;
    }
}

/**
 * Enhances the entire final prompt using OpenAI's GPT-4o-mini model.
 */
async function enhanceFinalPrompt() {
    const enhanceButton = enhanceFinalPromptButton;
    const text = finalPromptText.value.trim();

    if (!text) {
        alert('Final prompt is empty. Please add content before enhancing.');
        return;
    }

    // Disable button and show loading state
    enhanceButton.disabled = true;
    enhanceButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enhancing...';

    const messages = [
        {
            role: "system",
            content: "You are an AI assistant optimizing content for a chatbot knowledge base. Enhance and optimize the following content to make it detailed, structured, and suitable for use in a chatbot. Ensure the text is clear, informative, and well-organized. Retain any important links, images, and videos, and format them appropriately. Do not use ### or * in your response for formatting or any other purpose. Keep things well organized and ONLY use plain text."
        },
        {
            role: "user",
            content: `Content to enhance:\n\n${text}\n\nOptimized:`
        }
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                max_tokens: 4096, // Maximum tokens for GPT-4o-mini
                temperature: 0.7,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            })
        });

        if (!response.ok) throw new Error(`Failed to enhance final prompt. Status: ${response.status}`);

        const result = await response.json();
        const enhancedPrompt = result.choices[0].message.content.trim();

        // Update the final prompt textarea with enhanced content
        finalPromptText.value = enhancedPrompt;

        // Save to local storage
        saveFinalPrompt();

        // Update button state
        enhanceFinalPromptButton.innerHTML = '<i class="fas fa-check-circle"></i> Enhanced';

        alert('Final Prompt enhanced successfully!');
    } catch (error) {
        console.error('Error enhancing final prompt:', error);
        alert('Error enhancing final prompt: ' + error.message);
        enhanceFinalPromptButton.innerHTML = '<i class="fas fa-edit"></i> Enhance Final Prompt';
    } finally {
        enhanceFinalPromptButton.disabled = false;
    }
}

/**
 * Copies the final prompt to the clipboard.
 */
function copyFinalPrompt() {
    const finalPrompt = finalPromptText.value.trim();
    if (!finalPrompt) {
        alert('Final prompt is empty.');
        return;
    }

    navigator.clipboard.writeText(finalPrompt)
        .then(() => {
            alert('Final prompt copied to clipboard!');
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy the final prompt.');
        });
}

// =========================
// Chatbot Playground Functionality
// =========================

/**
 * Sends a user message to the chatbot and handles the response.
 */
async function sendUserMessage() {
    const userMessage = userInputTextarea.value.trim();
    if (!userMessage) return;

    // Display user message
    appendMessage('user', userMessage);

    // Add to conversation history
    const messages = [
        { role: "system", content: systemPromptTextarea.value },
        ...getConversationHistory()
    ];

    // Clear user input
    userInputTextarea.value = '';

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                max_tokens: parseInt(maxTokensInputPlayground.value) || 4096,
                temperature: parseFloat(temperatureInputPlayground.value) || 0.7,
                stream: true
            })
        });

        if (!response.ok) throw new Error(`Failed to fetch response. Status: ${response.status}`);

        // Initialize bot message container
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'bot-message';
        conversationDiv.appendChild(botMessageDiv);
        conversationDiv.scrollTop = conversationDiv.scrollHeight;

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let botMessage = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

            for (const line of lines) {
                const data = line.replace(/^data: /, '').trim();
                if (data === '[DONE]') break;
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0].delta.content;
                    if (content) {
                        botMessage += content;
                        botMessageDiv.textContent = botMessage;
                        conversationDiv.scrollTop = conversationDiv.scrollHeight;
                    }
                } catch (e) {
                    console.error('Error parsing stream:', e);
                }
            }
        }

        // Add bot message to conversation history
        addToConversationHistory('assistant', botMessage);
    } catch (error) {
        console.error('Error:', error);
        appendMessage('bot-error', `Error: ${error.message}`);
    }
}

/**
 * Appends a message to the conversation div.
 * @param {string} role - The role of the message sender ('user' or 'assistant').
 * @param {string} message - The message content.
 */
function appendMessage(role, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `${role}-message`;
    messageDiv.textContent = message;
    conversationDiv.appendChild(messageDiv);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

/**
 * Retrieves the conversation history for the chatbot.
 * @returns {Array<Object>} - Array of message objects.
 */
function getConversationHistory() {
    const userMessages = Array.from(conversationDiv.querySelectorAll('.user-message')).map(div => ({ role: "user", content: div.textContent }));
    const botMessages = Array.from(conversationDiv.querySelectorAll('.bot-message')).map(div => ({ role: "assistant", content: div.textContent }));
    return [...userMessages, ...botMessages];
}

/**
 * Adds a message to the conversation history.
 * @param {string} role - The role of the message sender ('assistant').
 * @param {string} message - The message content.
 */
function addToConversationHistory(role, message) {
    // This function can be expanded if maintaining a separate history is needed
}

// =========================
// Event Listeners
// =========================

// Get Links Button
getLinksButton.addEventListener('click', fetchSiteLinks);

// Select All Button
selectAllButton.addEventListener('click', toggleSelectAll);

// Extract Selected Content Button
extractButton.addEventListener('click', extractSelectedContent);

// Enhance Final Prompt Button
enhanceFinalPromptButton.addEventListener('click', enhanceFinalPrompt);

// Copy Final Prompt Button
copyFinalPromptButton.addEventListener('click', copyFinalPrompt);

// Send Message Button in Playground
sendMessageButton.addEventListener('click', sendUserMessage);

// Allow sending message with Enter key
userInputTextarea.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
    }
});

// =========================
// API Interaction Functions
// =========================

/**
 * Fetches content using ScrapingBee API.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The fetched content.
 */
async function fetchWithScrapingBee(url) {
    try {
        const response = await fetch(`https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(url)}&render_js=false`);
        if (!response.ok) throw new Error(`Failed to fetch ${url} with ScrapingBee. Status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('ScrapingBee Fetch Error:', error);
        throw error;
    }
}

/**
 * Fetches content using ScraperAPI.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The fetched content.
 */
async function fetchWithScraperApi(url) {
    try {
        const response = await fetch(`https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error(`Failed to fetch ${url} with ScraperAPI. Status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('ScraperAPI Fetch Error:', error);
        throw error;
    }
}

// =========================
// Helper Functions
// =========================

/**
 * Displays an error message to the user.
 * @param {string} message - The error message.
 */
function displayError(message) {
    errorMessage.textContent = `Error: ${message}`;
    errorMessage.style.display = 'block';
}

/**
 * Creates a page section with extracted content and action buttons.
 * @param {string} url - The URL of the page.
 * @param {string} text - The extracted text content.
 * @returns {HTMLElement} - The created page section element.
 */
function createPageSection(url, text) {
    const section = document.createElement('div');
    section.className = 'page-section';
    section.innerHTML = `
        <h3>${url}</h3>
        <p>${text}</p>
        <div class="button-group">
            <button class="btn-primary enhance-button" onclick="enhanceText(this)"><i class="fas fa-edit"></i> Enhance</button>
            <button class="btn-secondary combine-button" onclick="addToFinalPrompt(this)"><i class="fas fa-plus-circle"></i> Add to Final Prompt</button>
        </div>
    `;
    return section;
}

// =========================
// Final Prompt Functions
// =========================

/**
 * Adds the enhanced text to the final prompt.
 * @param {HTMLElement} button - The button that was clicked.
 */
function addToFinalPrompt(button) {
    const section = button.closest('.page-section');
    const url = section.querySelector('h3').textContent;
    const text = section.querySelector('p').textContent;

    // Append to final prompt
    finalPromptText.value += `\n\n${url}\n${text}`;

    // Save to local storage
    saveFinalPrompt();

    // Update final prompt with current configurations
    updateFinalPrompt();

    // Disable the button to prevent multiple additions
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-check-circle"></i> Added';

    alert('Content added to Final Prompt successfully!');
}

// =========================
// Chatbot Playground Functions
// =========================

/**
 * Sends a user message to the chatbot and handles the response.
 */
async function sendUserMessage() {
    const userMessage = userInputTextarea.value.trim();
    if (!userMessage) return;

    // Display user message
    appendMessage('user', userMessage);

    // Add to conversation history
    const messages = [
        { role: "system", content: systemPromptTextarea.value },
        ...getConversationHistory()
    ];

    // Clear user input
    userInputTextarea.value = '';

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                max_tokens: parseInt(maxTokensInputPlayground.value) || 4096,
                temperature: parseFloat(temperatureInputPlayground.value) || 0.7,
                stream: true
            })
        });

        if (!response.ok) throw new Error(`Failed to fetch response. Status: ${response.status}`);

        // Initialize bot message container
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'bot-message';
        conversationDiv.appendChild(botMessageDiv);
        conversationDiv.scrollTop = conversationDiv.scrollHeight;

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let botMessage = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

            for (const line of lines) {
                const data = line.replace(/^data: /, '').trim();
                if (data === '[DONE]') break;
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0].delta.content;
                    if (content) {
                        botMessage += content;
                        botMessageDiv.textContent = botMessage;
                        conversationDiv.scrollTop = conversationDiv.scrollHeight;
                    }
                } catch (e) {
                    console.error('Error parsing stream:', e);
                }
            }
        }

        // Add bot message to conversation history
        addToConversationHistory('assistant', botMessage);
    } catch (error) {
        console.error('Error:', error);
        appendMessage('bot-error', `Error: ${error.message}`);
    }
}

/**
 * Appends a message to the conversation div.
 * @param {string} role - The role of the message sender ('user' or 'assistant').
 * @param {string} message - The message content.
 */
function appendMessage(role, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `${role}-message`;
    messageDiv.textContent = message;
    conversationDiv.appendChild(messageDiv);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

/**
 * Retrieves the conversation history for the chatbot.
 * @returns {Array<Object>} - Array of message objects.
 */
function getConversationHistory() {
    const userMessages = Array.from(conversationDiv.querySelectorAll('.user-message')).map(div => ({ role: "user", content: div.textContent }));
    const botMessages = Array.from(conversationDiv.querySelectorAll('.bot-message')).filter(div => !div.classList.contains('bot-error')).map(div => ({ role: "assistant", content: div.textContent }));
    return [...userMessages, ...botMessages];
}

/**
 * Adds a message to the conversation history.
 * @param {string} role - The role of the message sender ('assistant').
 * @param {string} message - The message content.
 */
function addToConversationHistory(role, message) {
    // This function can be expanded if maintaining a separate history is needed
}

// =========================
// Enhancements for UI Feedback
// =========================

/**
 * Appends an error message to the conversation div.
 * @param {string} message - The error message.
 */
function appendMessage(role, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `${role}-message`;
    if (role === 'bot-error') {
        messageDiv.classList.add('error-message');
    }
    messageDiv.textContent = message;
    conversationDiv.appendChild(messageDiv);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

// =========================
// API Interaction Functions
// =========================

/**
 * Fetches content using ScrapingBee API.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The fetched content.
 */
async function fetchWithScrapingBee(url) {
    try {
        const response = await fetch(`https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(url)}&render_js=false`);
        if (!response.ok) throw new Error(`Failed to fetch ${url} with ScrapingBee. Status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('ScrapingBee Fetch Error:', error);
        throw error;
    }
}

/**
 * Fetches content using ScraperAPI.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The fetched content.
 */
async function fetchWithScraperApi(url) {
    try {
        const response = await fetch(`https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error(`Failed to fetch ${url} with ScraperAPI. Status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('ScraperAPI Fetch Error:', error);
        throw error;
    }
}
