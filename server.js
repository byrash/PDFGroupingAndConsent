const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure the pdfs directory exists
const pdfDir = path.join(__dirname, 'pdfs');
if (!fs.existsSync(pdfDir)) {
    console.log(`Creating pdfs directory: ${pdfDir}`);
    fs.mkdirSync(pdfDir, { recursive: true });
}

// PDF grouping configuration
const pdfGroups = {
    'Group 1': ['1.pdf', '2.pdf'],
    'Group 2': ['3.pdf', '4.pdf'],
    'Group 3': ['5.pdf'],
};

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve PDF files grouped into sections
app.get('/api/pdfs', (req, res) => {
    try {
        const pdfDir = path.join(__dirname, 'pdfs');

        // Check if the pdfs directory exists
        if (!fs.existsSync(pdfDir)) {
            console.error(`PDF directory not found: ${pdfDir}`);
            return res.status(500).json({
                error: 'PDF directory not found',
                message: 'The pdfs directory does not exist',
            });
        }

        // Get list of PDF files
        const pdfFiles = fs.readdirSync(pdfDir);
        console.log(`Found ${pdfFiles.length} files in pdfs directory`);

        // Filter PDF files
        const availableFiles = new Set(pdfFiles.filter((file) => file.endsWith('.pdf')));

        // Create groups with file details
        const groups = Object.entries(pdfGroups).map(([groupName, groupFiles]) => {
            // Filter to only include files that actually exist
            const files = groupFiles
                .filter((file) => availableFiles.has(file))
                .map((file) => ({
                    id: path.basename(file, '.pdf'),
                    name: file,
                    url: `/api/pdf/${file}`,
                }));

            return {
                name: groupName,
                files: files,
            };
        });

        res.json({ groups });
    } catch (error) {
        console.error('Error getting PDF list:', error);
        res.status(500).json({ error: 'Failed to get PDF list' });
    }
});

// Serve a specific PDF file
app.get('/api/pdf/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'pdfs', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        // Set proper content type for PDF
        res.setHeader('Content-Type', 'application/pdf');
        // Use stream to avoid loading large files entirely into memory
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Error serving PDF:', error);
        res.status(500).json({ error: 'Failed to serve PDF' });
    }
});

// Record user consent
app.post('/api/consent', (req, res) => {
    try {
        const consentData = req.body;
        const timestamp = new Date().toISOString();
        const groupName = consentData.groupName || 'Unknown Group';

        // Log the consent data with group information
        console.log(`Group "${groupName}" acknowledged consent at ${timestamp}`);
        console.log('Consent details:', consentData);

        res.status(200).json({
            message: `Consent recorded successfully for ${groupName}`,
            timestamp: timestamp,
        });
    } catch (error) {
        console.error('Error recording consent:', error);
        res.status(500).json({ error: 'Failed to record consent' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
