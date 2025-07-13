// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// Helper function to safely get DOM elements
function safeGetElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID "${id}" not found in the DOM`);
    }
    return element;
}

// DOM elements
const pdfViewer = safeGetElement('pdf-viewer');
const pdfLoader = safeGetElement('pdf-loader');
// PDF page controls have been removed
// const pdfControls = safeGetElement('pdf-controls');
// const prevPageBtn = safeGetElement('prev-page');
// const nextPageBtn = safeGetElement('next-page');
// const currentPageSpan = safeGetElement('current-page');
// const totalPagesSpan = safeGetElement('total-pages');

// Group elements
const currentGroupNameElement = safeGetElement('current-group-name');
const groupProgressElement = safeGetElement('group-progress');
const groupControls = safeGetElement('group-controls');
const prevGroupBtn = safeGetElement('prev-group');
const nextGroupBtn = safeGetElement('next-group');

// Confirmation elements (old overlay confirmation - no longer used)
const confirmationOverlay = safeGetElement('confirmation-overlay');
// These buttons were in the old confirmation overlay and no longer exist
// const confirmYesBtn = safeGetElement('confirm-yes');
// const confirmNoBtn = safeGetElement('confirm-no');

// Bottom confirmation elements removed
// const bottomConfirmation = safeGetElement('bottom-confirmation');
// const bottomConfirmYesBtn = safeGetElement('bottom-confirm-yes');
// const bottomConfirmNoBtn = safeGetElement('bottom-confirm-no');

// Variables
let currentPdf = null;
let currentPage = 1;
let totalPages = 0;
let pdfPages = [];
let observer = null;
let loadedPages = new Set();
let pdfCache = {}; // Cache for loaded PDF documents

// Group variables
let pdfGroups = [];
let currentGroupIndex = -1;
let currentFileIndex = -1;
let viewedGroups = new Set();
let viewedFiles = new Set();

// Initialize the app
async function initApp() {
    try {
        // Check for essential DOM elements
        if (!pdfViewer) {
            throw new Error('Critical element missing: pdf-viewer not found');
        }

        // PDF controls have been removed from the HTML

        // Fetch PDF groups from server
        const response = await fetch('/api/pdfs');
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Server response:', data);

        // Make sure data.groups exists - handle both old and new API formats
        if (data.groups) {
            // New format with groups
            pdfGroups = data.groups;
            console.log('PDF groups loaded:', pdfGroups.length);
        } else if (data.files) {
            // Old format with just files - create a single default group
            pdfGroups = [
                {
                    name: 'All PDFs',
                    files: data.files,
                },
            ];
            console.log('Created default group with', data.files.length, 'files');
        } else {
            throw new Error('No PDF files or groups found in server response');
        }

        // Make sure the overlay is hidden at startup
        if (confirmationOverlay) confirmationOverlay.classList.add('hidden');

        // Set up event listeners - with null checks
        // Page navigation controls have been removed
        // if (prevPageBtn) prevPageBtn.addEventListener('click', goToPreviousPage);
        // if (nextPageBtn) nextPageBtn.addEventListener('click', goToNextPage);
        if (prevGroupBtn) prevGroupBtn.addEventListener('click', goToPreviousGroup);
        if (nextGroupBtn) nextGroupBtn.addEventListener('click', goToNextGroup);
        // Old confirmation buttons no longer exist in the HTML
        // if (confirmYesBtn) confirmYesBtn.addEventListener('click', confirmNextGroup);
        // if (confirmNoBtn) confirmNoBtn.addEventListener('click', cancelConfirmation);
        // Bottom confirmation buttons have been removed

        // Set up intersection observer for lazy loading
        setupIntersectionObserver();

        // Load the first group if available
        if (pdfGroups.length > 0) {
            loadGroup(0);

            // Show group navigation controls if there are multiple groups
            if (groupControls && pdfGroups.length > 1) {
                groupControls.classList.remove('hidden');
            } else if (groupControls) {
                groupControls.classList.add('hidden'); // Hide if only one group
            }

            updateGroupNavigation();
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Failed to load PDF files. Please try again later.');
    }
}

// Set up intersection observer for lazy loading of PDF pages
function setupIntersectionObserver() {
    observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.pageNumber);
                    const fileId = entry.target.dataset.fileId;

                    // If this page hasn't been loaded yet, render it
                    const key = `${fileId}-${pageNum}`;
                    if (!loadedPages.has(key)) {
                        renderPage(fileId, pageNum);
                        loadedPages.add(key);
                    }
                }
            });
        },
        {
            root: null,
            rootMargin: '0px',
            threshold: 0.1,
        }
    );
}

// Load a specific group
async function loadGroup(groupIndex) {
    if (groupIndex < 0 || groupIndex >= pdfGroups.length) return;

    try {
        // Bottom confirmation has been removed

        // Clear previous PDF content
        resetPdfViewer();

        // Show loader
        pdfLoader.classList.remove('hidden');

        // Update group information
        currentGroupIndex = groupIndex;
        currentFileIndex = 0;
        const group = pdfGroups[groupIndex];
        if (currentGroupNameElement) currentGroupNameElement.textContent = group.name;
        updateGroupProgress();

        // Create PDF file sections for this group
        createGroupStructure(group);

        // Preload PDFs in the background (just metadata, not rendering)
        preloadGroupPdfs(group);

        // Hide loader
        pdfLoader.classList.add('hidden');

        // Update navigation
        updateGroupNavigation();

        // Show group navigation controls only if there are multiple groups
        if (groupControls && pdfGroups.length > 1) {
            groupControls.classList.remove('hidden');
        } else if (groupControls) {
            groupControls.classList.add('hidden');
        }

        // Scroll to top of group
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading group:', error);
        pdfLoader.classList.add('hidden');
        alert('Failed to load the PDF group. Please try again later.');
    }
}

// Create the group structure with file sections
function createGroupStructure(group) {
    // Create group header
    const groupHeader = document.createElement('h2');
    groupHeader.className = 'pdf-group-header';
    groupHeader.textContent = `${group.name} - ${group.files.length} files`;
    pdfViewer.appendChild(groupHeader);

    // Add each file in the group
    group.files.forEach((file, index) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'pdf-file';
        fileSection.id = `file-container-${file.id}`;

        // Create file header
        const fileHeader = document.createElement('div');
        fileHeader.className = 'pdf-file-header';

        const fileName = document.createElement('div');
        fileName.textContent = file.name;

        const fileStatus = document.createElement('span');
        fileStatus.className = `file-status ${viewedFiles.has(file.id) ? 'viewed' : ''}`;
        fileStatus.textContent = viewedFiles.has(file.id) ? 'Viewed' : 'Not Viewed';
        fileStatus.id = `file-status-${file.id}`;

        fileHeader.appendChild(fileName);
        fileHeader.appendChild(fileStatus);
        fileSection.appendChild(fileHeader);

        // Create container for PDF pages
        const pdfContainer = document.createElement('div');
        pdfContainer.className = 'pdf-pages-container';
        pdfContainer.id = `pdf-container-${file.id}`;
        fileSection.appendChild(pdfContainer);

        // Add file section to viewer
        pdfViewer.appendChild(fileSection);

        // Load the PDF file
        loadPdfFile(file);
    });
}

// Load a specific PDF file
async function loadPdfFile(file) {
    try {
        // Check if we've already loaded this PDF
        if (!pdfCache[file.url]) {
            // Get PDF info without loading all pages
            console.log(`Loading PDF from URL: ${file.url}`);
            const loadingTask = pdfjsLib.getDocument(file.url);

            // Store the loading task in the cache
            pdfCache[file.url] = loadingTask.promise;
        } else {
            console.log(`Using cached PDF for: ${file.url}`);
        }

        // Get PDF from cache or load it
        const pdf = await pdfCache[file.url];
        const pdfContainer = document.getElementById(`pdf-container-${file.id}`);

        // Create placeholders for all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page';
            pageDiv.id = `page-${file.id}-${i}`;
            pageDiv.dataset.pageNumber = i;
            pageDiv.dataset.fileId = file.id;
            pageDiv.style.minHeight = '300px'; // Smaller placeholder height
            pageDiv.innerHTML = `<div class="page-loading">Page ${i} - Click or scroll to load</div>`;

            pdfContainer.appendChild(pageDiv);

            // Observe the page element for intersection
            observer.observe(pageDiv);
        }

        // Update UI to show PDF is ready but not necessarily viewed
        updateFileStatus(file.id, 'Ready');
    } catch (error) {
        console.error(`Error loading PDF ${file.name}:`, error);
        const pdfContainer = document.getElementById(`pdf-container-${file.id}`);
        if (pdfContainer) {
            pdfContainer.innerHTML = `<div class="error-message">Failed to load PDF: ${error.message}</div>`;
        }
    }
}

// Render a specific page of a PDF
async function renderPage(fileId, pageNumber) {
    try {
        // Show loading indicator
        const pageContainer = document.getElementById(`page-${fileId}-${pageNumber}`);
        if (!pageContainer) return;

        pageContainer.innerHTML = `<div class="page-loading">Loading page ${pageNumber}...</div>`;

        // Find the PDF url - with error handling
        const file = pdfGroups[currentGroupIndex]?.files.find((f) => f.id === fileId);
        if (!file || !file.url) {
            throw new Error(`Could not find PDF file with ID: ${fileId}`);
        }
        const url = file.url;

        // Use cached PDF document if available, otherwise load it
        if (!pdfCache[url]) {
            console.log(`Loading PDF for rendering: ${url}`);
            pdfCache[url] = pdfjsLib.getDocument(url).promise;
        } else {
            console.log(`Using cached PDF for rendering: ${url}`);
        }

        // Get the PDF from cache
        const pdf = await pdfCache[url];

        // Get the page
        const page = await pdf.getPage(pageNumber);

        // Clear the container
        pageContainer.innerHTML = '';

        // Create a canvas for the page
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set the scale (adjust as needed)
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render the page on the canvas
        await page.render({
            canvasContext: context,
            viewport: viewport,
        }).promise;

        // Add the canvas to the container
        pageContainer.appendChild(canvas);

        // Mark this page as viewed - this is important for tracking progress
        markFileAsViewed(fileId);

        // Check if this is the last page of this document
        const totalPages = pdf.numPages;
        if (pageNumber === totalPages) {
            console.log(`Completed viewing all pages of document ${fileId}`);
        }
    } catch (error) {
        console.error(`Error rendering page ${pageNumber} of file ${fileId}:`, error);
        const pageContainer = document.getElementById(`page-${fileId}-${pageNumber}`);
        if (pageContainer) {
            pageContainer.innerHTML = `<div class="error-message">Failed to load page: ${error.message}</div>`;
        }
    }
}

// Reset the PDF viewer
function resetPdfViewer() {
    pdfViewer.innerHTML = '';
    // PDF controls have been removed
    // pdfControls.classList.add('hidden');
    currentPdf = null;
    currentPage = 1;
    totalPages = 0;
    pdfPages = [];
    loadedPages = new Set();
    // Don't clear the PDF cache between group changes
    // This allows us to reuse already loaded PDFs
}

// These page navigation functions are kept for reference but are no longer used
// since the page navigation controls have been removed from the HTML

// Go to the previous page - no longer used
function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        // updateCurrentPage(); // No longer needed
        scrollToPage(currentPage);
    }
}

// Go to the next page - no longer used
function goToNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        // updateCurrentPage(); // No longer needed
        scrollToPage(currentPage);
    }
}

// Update the current page indicator - no longer used
function updateCurrentPage() {
    // Page navigation elements have been removed
    // currentPageSpan.textContent = currentPage;
    // prevPageBtn.disabled = currentPage === 1;
    // nextPageBtn.disabled = currentPage === totalPages;
    console.log(`Current page: ${currentPage} of ${totalPages}`);
}

// Go to the previous group
function goToPreviousGroup() {
    if (currentGroupIndex > 0) {
        loadGroup(currentGroupIndex - 1);
    }
}

// Go to the next group or sign final consent
function goToNextGroup() {
    // Check if this is the last group and all groups are viewed (in "Sign" mode)
    const allGroupsViewed = pdfGroups.length > 0 && viewedGroups.size >= pdfGroups.length;

    if (allGroupsViewed && currentGroupIndex === pdfGroups.length - 1) {
        // In "Sign" mode - show consent confirmation
        showConsentConfirmation();
    } else if (currentGroupIndex < pdfGroups.length - 1) {
        // Record the group consent
        const timestamp = new Date().toISOString();
        console.log(`User consented to group ${currentGroupIndex} at ${timestamp}`);

        // Log the consent for this specific group
        try {
            fetch('/api/consent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    consentType: 'group',
                    groupIndex: currentGroupIndex,
                    groupName: pdfGroups[currentGroupIndex]?.name || `Group ${currentGroupIndex + 1}`,
                    timestamp: timestamp,
                    files: Array.from(viewedFiles),
                }),
            });
        } catch (error) {
            console.error('Error recording group consent:', error);
        }

        // Go to next group
        confirmationOverlay.classList.add('hidden');
        loadGroup(currentGroupIndex + 1);
    }
}

// Bottom confirmation functions - now a no-op since we don't want auto-advance
function showBottomConfirmation() {
    // No-op - don't auto-advance, just let user navigate manually
    console.log('Group complete. Manual navigation required.');
}

// Hide the bottom confirmation area - no-op since element was removed
function hideBottomConfirmation() {
    // No-op - confirmation element no longer exists
}

// Legacy confirmation functions - now a no-op
function showConfirmationDialog() {
    // No-op - don't auto-advance, let user navigate manually
    console.log('Group complete. Manual navigation required.');
}

function hideConfirmationDialog() {
    // No-op - confirmation elements no longer exist
}

// Move to next group (no confirmation needed anymore)
function confirmNextGroup() {
    // No need to hide confirmation as it no longer exists

    // Mark current group as viewed
    viewedGroups.add(currentGroupIndex);
    updateGroupProgress();

    // Load next group if available
    if (currentGroupIndex < pdfGroups.length - 1) {
        loadGroup(currentGroupIndex + 1);
    } else {
        alert('Congratulations! You have completed all PDF groups.');
    }
}

// Cancel confirmation and stay on current group - no longer needed but kept for API compatibility
function cancelConfirmation() {
    // No-op - confirmation element no longer exists
}

// Scroll to a specific page
function scrollToPage(pageNumber) {
    const pageElement = document.getElementById(`page-${pageNumber}`);
    if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Update file status without marking as viewed
function updateFileStatus(fileId, status) {
    const fileStatus = document.getElementById(`file-status-${fileId}`);
    if (fileStatus) {
        fileStatus.textContent = status;
        if (status === 'Viewed') {
            fileStatus.classList.add('viewed');
        } else {
            fileStatus.classList.add('ready');
        }
    }
}

// Mark a file as viewed
function markFileAsViewed(fileId) {
    viewedFiles.add(fileId);

    // Update file status indicator
    updateFileStatus(fileId, 'Viewed');

    // Check if all files in the current group are viewed
    if (isGroupFullyViewed()) {
        viewedGroups.add(currentGroupIndex);
        // Don't auto-advance to next group - let the user navigate manually
        console.log('All files in group viewed. Ready for manual navigation.');
    }

    // Update navigation
    updateGroupNavigation();
}

// Check if all files in the current group have been viewed
function isGroupFullyViewed() {
    if (currentGroupIndex < 0) return false;

    const group = pdfGroups[currentGroupIndex];
    return group.files.every((file) => viewedFiles.has(file.id));
}

// Update the group progress indicator
function updateGroupProgress() {
    const viewed = viewedGroups.size;
    const total = pdfGroups.length;
    groupProgressElement.textContent = `${viewed} of ${total} groups completed`;
}

// Update group navigation buttons
function updateGroupNavigation() {
    prevGroupBtn.disabled = currentGroupIndex <= 0;

    // Check if all groups have been viewed
    const allGroupsViewed = pdfGroups.length > 0 && viewedGroups.size >= pdfGroups.length;

    if (allGroupsViewed && currentGroupIndex === pdfGroups.length - 1) {
        // On the last group and all groups are viewed - change to "Sign" button
        nextGroupBtn.textContent = 'Sign';
        nextGroupBtn.classList.add('sign-button');
        nextGroupBtn.disabled = false;
    } else {
        // Normal navigation state
        if (nextGroupBtn.textContent !== 'Consent & Go to Next Group') {
            nextGroupBtn.textContent = 'Consent & Go to Next Group';
            nextGroupBtn.classList.remove('sign-button');
        }
        nextGroupBtn.disabled = currentGroupIndex >= pdfGroups.length - 1;
    }
}

// Show final consent confirmation when the "Sign" button is clicked
function showConsentConfirmation() {
    // Record the final consent action
    const timestamp = new Date().toISOString();
    console.log(`User gave final consent at ${timestamp}`);

    // Show confirmation to the user
    alert('Thank you! You have successfully consented to all document groups.');

    // Send the final consent to the server
    try {
        fetch('/api/consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                consentType: 'final',
                groupName: 'All Groups',
                consented: true,
                timestamp: timestamp,
                groups: Array.from(viewedGroups),
                files: Array.from(viewedFiles),
            }),
        }).then((response) => {
            if (!response.ok) {
                console.error('Failed to record final consent on server');
            } else {
                console.log('Final consent recorded successfully on server');
            }
        });
    } catch (error) {
        console.error('Error recording final consent:', error);
    }

    // Disable the sign button after consent
    if (nextGroupBtn) {
        nextGroupBtn.disabled = true;
        nextGroupBtn.textContent = 'Signed';
    }
}

// Preload PDFs for the current group to improve performance
function preloadGroupPdfs(group) {
    // Start preloading all PDFs in the group in the background
    group.files.forEach((file) => {
        if (!pdfCache[file.url]) {
            // Use a lower priority for preloading
            console.log(`Preloading PDF: ${file.url}`);
            pdfCache[file.url] = pdfjsLib.getDocument(file.url).promise;
        }
    });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initApp);
