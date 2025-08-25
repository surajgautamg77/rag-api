const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentProcessor = require('../services/documentProcessor');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  // limits: {
  //   fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  // },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.csv'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and CSV files are allowed'), false);
    }
  }
});

// POST /api/upload - Upload and process documents
router.post('/', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const filename = req.file.originalname;
    const fileExtension = path.extname(filename).toLowerCase();

    let result;
    
    // Process file based on type
    if (fileExtension === '.pdf') {
      result = await documentProcessor.processPDF(filePath, filename);
    } else if (fileExtension === '.csv') {
      result = await documentProcessor.processCSV(filePath, filename);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'Document processed successfully',
      filename: filename,
      chunks: result.chunks,
      documentId: result.documentId
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Error processing document',
      details: error.message
    });
  }
});

// GET /api/upload/documents - Get list of uploaded documents
router.get('/documents', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    const query = `
      SELECT id, filename, file_type, created_at,
             (SELECT COUNT(*) FROM embeddings WHERE document_id = d.id) as chunk_count
      FROM documents d
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      documents: result.rows
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Error fetching documents',
      details: error.message
    });
  }
});

// DELETE /api/upload/documents/:id - Delete a document and its embeddings
router.delete('/documents/:id', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const documentId = req.params.id;
    
    const query = 'DELETE FROM documents WHERE id = $1 RETURNING filename';
    const result = await pool.query(query, [documentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      success: true,
      message: `Document "${result.rows[0].filename}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      error: 'Error deleting document',
      details: error.message
    });
  }
});

module.exports = router;
