const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Sample data for document groups
// In a real application, this would come from a database
const documentGroups = [
    {
        groupId: 'group1',
        groupName: 'Group1 Documents',
        documents: [
            { documentId: 'doc1', fileName: '1.pdf', title: 'Main Contract' },
            { documentId: 'doc2', fileName: '2.pdf', title: 'Terms and Conditions' },
        ],
    },
    {
        groupId: 'group2',
        groupName: 'Group2 Documents',
        documents: [
            { documentId: 'doc3', fileName: '3.pdf', title: 'Agreement Document' },
            { documentId: 'doc4', fileName: '4.pdf', title: 'Appendix' },
        ],
    },
    {
        groupId: 'group3',
        groupName: 'Group3- Final Documents',
        documents: [{ documentId: 'doc5', fileName: '5.pdf', title: 'Final Document' }],
    },
];

// API endpoint to get all document groups
app.get('/api/document-groups', (req, res) => {
    res.json(documentGroups);
});

// API endpoint to get a specific group by ID
app.get('/api/document-groups/:groupId', (req, res) => {
    const { groupId } = req.params;
    const group = documentGroups.find((g) => g.groupId === groupId);

    if (!group) {
        return res.status(404).json({ message: 'Group not found' });
    }

    res.json(group);
});

// API endpoint to get a specific document by ID
app.get('/api/documents/:documentId', (req, res) => {
    const { documentId } = req.params;

    // Find the document in all groups
    for (const group of documentGroups) {
        const document = group.documents.find((doc) => doc.documentId === documentId);
        if (document) {
            return res.json(document);
        }
    }

    res.status(404).json({ message: 'Document not found' });
});

// API endpoint to serve PDF files
app.get('/api/pdf/:fileName', (req, res) => {
    const { fileName } = req.params;
    const filePath = path.join(__dirname, 'pdfs', fileName);

    // Check if file exists
    if (fs.existsSync(filePath)) {
        // Set appropriate headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

        // Add cache headers to improve performance
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

        // Create read stream and pipe to response
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('PDF file not found');
    }
});

// Mock API endpoint for document signing
app.post('/api/sign', (req, res) => {
    const { groupIds } = req.body;

    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No document groups specified' });
    }

    // In a real application, this would perform actual signing logic
    // For now, we'll just return a success message
    res.json({
        success: true,
        message: 'Documents signed successfully',
        signedAt: new Date().toISOString(),
        signedGroups: groupIds,
    });
});

// Serve the main HTML file for any other route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create necessary directories if they don't exist
const dirPaths = ['pdfs', 'public'];
dirPaths.forEach((dir) => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
