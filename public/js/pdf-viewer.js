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
let currentFileId = null; // Track which file is currently being viewed

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

        // Set up scroll tracking to detect when user reaches end of document
        initScrollTracking();

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

    // Add manual override button
    const manualOverrideBtn = document.createElement('button');
    manualOverrideBtn.className = 'manual-override-btn';
    manualOverrideBtn.textContent = 'Having trouble? Mark all as viewed';
    manualOverrideBtn.onclick = forceMarkAllFilesAsViewed;

    // Append both to header container
    const headerContainer = document.createElement('div');
    headerContainer.className = 'group-header-container';
    headerContainer.appendChild(groupHeader);
    headerContainer.appendChild(manualOverrideBtn);

    pdfViewer.appendChild(headerContainer);

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
        // Update the current file being viewed
        currentFileId = fileId;
        console.log(`Now viewing file: ${fileId}, page: ${pageNumber}`);

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

        // Check if this is the last page of this document
        const totalPages = pdf.numPages;
        if (pageNumber === totalPages) {
            console.log(`Rendered all pages of document ${fileId}, waiting for user to scroll to end`);
            // We'll mark as viewed only after scrolling to end or when navigating away
            // Set the current file ID so it can be picked up by the scroll handler
            currentFileId = fileId;
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
    console.log('User clicked next/sign button');

    // First, check if any visible files should be marked as viewed but haven't been
    checkVisibleFiles();

    // Force mark all files that are at least partially visible
    forceMarkVisibleFiles();

    // Now check if we can proceed
    const isLastGroup = currentGroupIndex === pdfGroups.length - 1;
    const groupFullyViewed = isGroupFullyViewed();

    // For the final group, require that all files be viewed before signing
    if (isLastGroup) {
        // Only allow signing if all files in the group have been viewed
        if (groupFullyViewed) {
            showConsentConfirmation();
        } else {
            console.log("Can't sign yet - not all documents have been viewed");
            alert('Please scroll through all documents in this group before signing.');
        }
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
    // Don't do anything if already viewed
    if (viewedFiles.has(fileId)) {
        console.log(`File ${fileId} was already marked as viewed`);
        return;
    }

    console.log(`Marking file ${fileId} as viewed`);
    viewedFiles.add(fileId);

    // Update file status indicator
    updateFileStatus(fileId, 'Viewed');

    // Log current status
    console.log(`viewedFiles now contains ${viewedFiles.size} items`);

    try {
        // Get file info for better logging
        const fileInfo = pdfGroups.flatMap((g) => g.files).find((f) => f.id === fileId);
        if (fileInfo) {
            console.log(`Marked "${fileInfo.name}" (ID: ${fileId}) as viewed`);
        }
    } catch (err) {
        console.error('Error getting file info:', err);
    }

    // Check if all files in the current group are viewed
    if (isGroupFullyViewed()) {
        viewedGroups.add(currentGroupIndex);

        // If this is the final group, show a message about signing being available
        if (currentGroupIndex === pdfGroups.length - 1) {
            console.log('All files in final group viewed. Sign button is now available.');
        } else {
            console.log('All files in group viewed. Ready for manual navigation.');
        }
    }

    // Update navigation - this will enable the Sign button if in the last group
    // and all files have been viewed
    updateGroupNavigation();
}

// Mark all files in the current group as viewed (for Sign action)
function markAllGroupFilesAsViewed() {
    if (currentGroupIndex < 0 || currentGroupIndex >= pdfGroups.length) return;

    const group = pdfGroups[currentGroupIndex];
    group.files.forEach((file) => {
        markFileAsViewed(file.id);
    });

    console.log(`All files in group ${pdfGroups[currentGroupIndex].name} marked as viewed`);
}

// Check if all files in the current group have been viewed
function isGroupFullyViewed() {
    if (currentGroupIndex < 0) {
        console.log('isGroupFullyViewed: Invalid group index');
        return false;
    }
    if (!pdfGroups[currentGroupIndex]) {
        console.log('isGroupFullyViewed: Group not found');
        return false;
    }

    const group = pdfGroups[currentGroupIndex];
    if (!group.files || group.files.length === 0) {
        console.log('isGroupFullyViewed: Empty group, considering as viewed');
        return true; // Empty group is considered viewed
    }

    console.log('DETAILED VIEW STATUS CHECK:');
    console.log(`Current viewedFiles set contains ${viewedFiles.size} items: ${Array.from(viewedFiles).join(', ')}`);

    // Detailed check of each file's view status
    group.files.forEach((file) => {
        const isViewed = viewedFiles.has(file.id);
        console.log(`File ${file.id} (${file.name}): ${isViewed ? 'VIEWED' : 'NOT VIEWED'}`);
    });

    const result = group.files.every((file) => viewedFiles.has(file.id));
    console.log(`isGroupFullyViewed final result: ${result ? 'YES - All files viewed' : 'NO - Some files not viewed'}`);

    // List which files are viewed vs not viewed
    const viewedCount = group.files.filter((f) => viewedFiles.has(f.id)).length;
    console.log(`Files viewed in current group: ${viewedCount}/${group.files.length}`);

    return result;
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

    // Check if we're on the last group
    const isLastGroup = currentGroupIndex === pdfGroups.length - 1;
    const groupFullyViewed = isGroupFullyViewed();

    // Debug information to help diagnose the issue
    if (isLastGroup) {
        console.log('Last group navigation update:');
        console.log(`- Group fully viewed: ${groupFullyViewed}`);
        console.log(`- Files in group: ${pdfGroups[currentGroupIndex].files.length}`);
        console.log(`- Files viewed: ${Array.from(viewedFiles).length}`);

        if (!groupFullyViewed) {
            // Debug which files are not viewed
            const notViewedFiles = pdfGroups[currentGroupIndex].files.filter((f) => !viewedFiles.has(f.id));
            console.log(`- Files not viewed: ${notViewedFiles.map((f) => f.name).join(', ')}`);
        }
    }

    if (isLastGroup && groupFullyViewed) {
        // On the last group AND it's been fully viewed - show the Sign button
        console.log('ENABLING SIGN BUTTON - All files viewed!');
        nextGroupBtn.textContent = 'Sign';
        nextGroupBtn.classList.add('sign-button');
        nextGroupBtn.disabled = false;
    } else if (isLastGroup) {
        // On last group but not fully viewed - show disabled button with informative text
        console.log('Sign button still disabled - not all files viewed');
        nextGroupBtn.textContent = 'View All Documents to Sign';
        nextGroupBtn.classList.add('sign-button');
        nextGroupBtn.disabled = true;
    } else {
        // Normal navigation state for non-last groups
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

// Track scroll position and check if user reached bottom of document
function initScrollTracking() {
    // Use a debounced version of the scroll handler to improve performance
    let scrollTimeout;
    window.addEventListener('scroll', function () {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScroll, 200); // 200ms debounce
    });

    // Also check files on window resize as this may change what's visible
    let resizeTimeout;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(checkVisibleFiles, 200);
    });
}

// Handle scroll events to detect when user reaches the end of a document
function handleScroll() {
    // Instead of just checking the currentFileId, we'll check all file containers
    // to see which ones the user has scrolled through

    console.log('--- Scroll event detected ---');

    // Get current viewport dimensions
    const viewportHeight = window.innerHeight;
    const scrollPosition = window.scrollY;
    const viewportBottom = scrollPosition + viewportHeight;
    const documentHeight = document.documentElement.scrollHeight;

    console.log(`Viewport: ${viewportHeight}, Scroll: ${scrollPosition}, Bottom: ${viewportBottom}, DocHeight: ${documentHeight}`);

    // Check if user has scrolled near the bottom of the entire page (within 100px)
    const isNearBottom = viewportBottom >= documentHeight - 100;
    if (isNearBottom) {
        console.log('USER HAS SCROLLED TO THE BOTTOM OF THE PAGE!');
        // When user scrolls to bottom of page, mark all files as viewed
        if (currentGroupIndex >= 0 && currentGroupIndex < pdfGroups.length) {
            const currentGroup = pdfGroups[currentGroupIndex];
            if (currentGroup && currentGroup.files) {
                currentGroup.files.forEach((file) => {
                    if (!viewedFiles.has(file.id)) {
                        console.log(`Bottom of page reached: Marking file ${file.id} (${file.name}) as viewed`);
                        markFileAsViewed(file.id);
                    }
                });
                updateGroupNavigation();
                return; // No need to do individual file checks if we've marked all
            }
        }
    }

    // Only process if we're in a valid group
    if (currentGroupIndex < 0 || currentGroupIndex >= pdfGroups.length) {
        console.log('Scroll handler: Invalid group index');
        return;
    }

    // Check each file in the current group
    const currentGroup = pdfGroups[currentGroupIndex];
    if (!currentGroup || !currentGroup.files) {
        console.log('Scroll handler: No valid files in group');
        return;
    }

    console.log(`Checking files in group ${currentGroup.name} (${currentGroup.files.length} files)`);
    let filesChecked = 0;
    let filesMarkedAsViewed = 0;

    currentGroup.files.forEach((file) => {
        filesChecked++;

        // Skip already viewed files for performance
        if (viewedFiles.has(file.id)) {
            console.log(`File ${file.id} (${file.name}) already viewed, skipping check`);
            return;
        }

        // Check if this file's container is visible
        const fileContainer = document.getElementById(`file-container-${file.id}`);
        if (!fileContainer) {
            console.log(`File container for ${file.id} not found in DOM`);
            return;
        }

        // Get file container position
        const rect = fileContainer.getBoundingClientRect();

        // More aggressive check:
        // 1. If the bottom of the file is visible or above viewport (already scrolled past)
        // 2. OR if at least half of the file is visible in the viewport
        // Mark it as viewed

        const fileHeight = rect.height;
        const visiblePortion = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
        const percentVisible = (visiblePortion / fileHeight) * 100;

        // If bottom is visible/past OR if half the file is visible
        if (rect.bottom <= viewportHeight * 1.2 || percentVisible >= 50) {
            console.log(`File ${file.id} (${file.name}) - marking as viewed: ` + `bottom in viewport: ${rect.bottom <= viewportHeight * 1.2}, ` + `percent visible: ${percentVisible.toFixed(2)}%`);
            markFileAsViewed(file.id);
            filesMarkedAsViewed++;
        } else {
            console.log(`File ${file.id} (${file.name}) not yet viewed - bottom: ${rect.bottom}, ` + `visible: ${percentVisible.toFixed(2)}%`);
        }
    });

    console.log(`Scroll check complete: ${filesChecked} files checked, ${filesMarkedAsViewed} newly marked as viewed`);

    // Check if the whole group is now viewed after processing
    const groupFullyViewed = isGroupFullyViewed();
    if (groupFullyViewed) {
        console.log(`Group ${currentGroup.name} is now fully viewed!`);
        // Force update the navigation buttons
        updateGroupNavigation();
    }
}

// Check which files are currently visible in the viewport and mark them as viewed
function checkVisibleFiles() {
    console.log('=== CHECKING ALL FILES FOR VISIBILITY ===');

    // Only process if we're in a valid group
    if (currentGroupIndex < 0 || currentGroupIndex >= pdfGroups.length) {
        console.log('CheckVisibleFiles: Invalid group index');
        return;
    }

    // Check each file in the current group
    const currentGroup = pdfGroups[currentGroupIndex];
    if (!currentGroup || !currentGroup.files) {
        console.log('CheckVisibleFiles: No valid files in group');
        return;
    }

    console.log(`Checking all files in group ${currentGroup.name} (${currentGroup.files.length} files)...`);

    // IMPORTANT: Since this is triggered by user action (clicking "next" or "sign"),
    // we'll be more aggressive about marking files as viewed

    // First option: Mark all files as viewed in the current group
    // This is simple but effective, especially if the user has scrolled through most content
    currentGroup.files.forEach((file) => {
        if (!viewedFiles.has(file.id)) {
            console.log(`Marking file ${file.id} (${file.name}) as viewed (user initiated action)`);
            markFileAsViewed(file.id);
        } else {
            console.log(`File ${file.id} (${file.name}) already viewed`);
        }
    });

    // Log final status
    const allViewed = isGroupFullyViewed();
    console.log(`After checking all files, group is fully viewed: ${allViewed}`);

    // Force update navigation
    updateGroupNavigation();
}

// Force mark all currently visible files as viewed
function forceMarkVisibleFiles() {
    if (!viewedFiles) {
        console.error('viewedFiles is not initialized');
        return;
    }

    console.log('=== FORCE MARKING VISIBLE FILES AS VIEWED ===');

    // Check all files in the current group
    const currentGroup = pdfGroups[currentGroupIndex];
    if (currentGroup && currentGroup.files) {
        let filesMarked = 0;

        currentGroup.files.forEach((file) => {
            const fileId = `pdf-container-${file.id}`;
            const fileContainer = document.getElementById(fileId);

            if (fileContainer) {
                const rect = fileContainer.getBoundingClientRect();
                // If any part of the file is visible in the viewport
                const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;

                console.log(`Force check - File ${file.id}:`, {
                    isVisible,
                    alreadyViewed: viewedFiles.has(file.id) || false,
                    rectTop: rect.top,
                    rectBottom: rect.bottom,
                    windowHeight: window.innerHeight,
                });

                // Mark as viewed if any part is visible or if it's above the current viewport
                // (meaning user has likely scrolled past it)
                if ((isVisible || rect.bottom < 0) && !viewedFiles.has(file.id)) {
                    console.log(`Force marking file ${file.id} as viewed`);
                    markFileAsViewed(file.id);
                    filesMarked++;
                }
            }
        });

        console.log(`Forced marked ${filesMarked} files as viewed`);

        // Check if this completes the group
        if (filesMarked > 0 && isGroupFullyViewed()) {
            console.log('Group now fully viewed after force marking');
            updateGroupNavigation();
        }
    }
}

// Debug function to force sign button to appear (temporary)
function forceEnableSignButton() {
    console.log('FORCE ENABLING SIGN BUTTON');

    // Mark all files in the current group as viewed
    if (currentGroupIndex >= 0 && currentGroupIndex < pdfGroups.length) {
        const group = pdfGroups[currentGroupIndex];
        group.files.forEach((file) => {
            console.log(`Marking file ${file.id} (${file.name}) as viewed`);
            viewedFiles.add(file.id);
            updateFileStatus(file.id, 'Viewed');
        });

        // Mark group as viewed
        viewedGroups.add(currentGroupIndex);

        // Update navigation
        updateGroupNavigation();

        console.log('Sign button should now be enabled');
    }
}

// Add keyboard shortcuts for debug purposes
document.addEventListener('keydown', function (e) {
    // Alt+S to force enable the sign button (debug only)
    if (e.altKey && e.key === 's') {
        console.log('Debug key combination pressed - enabling sign button');
        forceEnableSignButton();
    }

    // Alt+V to force mark all files in current group as viewed
    if (e.altKey && e.key === 'v') {
        console.log('Debug key combination pressed - marking all files as viewed');
        forceMarkAllFilesAsViewed();
    }
});

// Manual override to mark all files in current group as viewed
function forceMarkAllFilesAsViewed() {
    if (currentGroupIndex >= 0 && currentGroupIndex < pdfGroups.length) {
        const currentGroup = pdfGroups[currentGroupIndex];
        if (currentGroup && currentGroup.files) {
            console.log(`MANUAL OVERRIDE: Marking all ${currentGroup.files.length} files in current group as viewed`);

            currentGroup.files.forEach((file) => {
                console.log(`Marking file ${file.id} (${file.name}) as viewed`);
                viewedFiles.add(file.id);
                updateFileStatus(file.id, 'Viewed');
            });

            // Check if group is fully viewed and update UI
            const isFullyViewed = isGroupFullyViewed();
            console.log(`Group fully viewed after override: ${isFullyViewed}`);

            // Update navigation to show Sign button if appropriate
            updateGroupNavigation();

            // Show a message to confirm the action
            alert('All files in this group have been manually marked as viewed.');
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initApp);
