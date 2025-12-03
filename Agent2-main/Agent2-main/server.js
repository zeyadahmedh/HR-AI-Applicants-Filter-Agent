const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { QdrantClient } = require('@qdrant/js-client-rest');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

// Collection name for applications
const COLLECTION_NAME = 'job_applications';

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    res.json({
      success: true,
      message: 'Application portal is running',
      qdrant: {
        connected: true,
        collection_exists: collectionExists,
        collection_name: COLLECTION_NAME
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Main API endpoint for job application submission
app.post('/api/apply', upload.single('cv'), async (req, res) => {
  try {
    const { name, email } = req.body;
    const cvFile = req.file;

    // Validation
    if (!name || !email || !cvFile) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and CV file'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    console.log(`Processing application for: ${name} (${email})`);

    // Step 1: Extract text from PDF
    let cvText = '';
    try {
      const pdfData = await pdfParse(cvFile.buffer);
      cvText = pdfData.text.substring(0, 5000); // Limit to 5000 chars for embedding
      console.log(`Extracted ${cvText.length} characters from PDF`);
    } catch (pdfError) {
      console.error('Error parsing PDF:', pdfError);
      cvText = `CV file: ${cvFile.originalname}`;
    }

    // Step 2: Generate embedding from CV text
    // For simplicity, we'll use a basic embedding or leave it empty
    // In production, you'd use an embedding model
    const embedding = generateSimpleEmbedding(cvText);

    // Step 3: Encode PDF to base64 for storage
    const pdfBase64 = cvFile.buffer.toString('base64');
    const pdfMetadata = {
      name: cvFile.originalname,
      size: cvFile.size,
      type: cvFile.mimetype,
      upload_date: new Date().toISOString()
    };

    // Step 4: Create point for Qdrant
    const applicationId = Date.now(); // Use timestamp as ID
    const point = {
      id: applicationId,
      vector: embedding,
      payload: {
        application_id: applicationId,
        name: name,
        email: email,
        cv_text: cvText,
        cv_pdf_base64: pdfBase64,
        cv_metadata: pdfMetadata,
        timestamp: new Date().toISOString(),
        status: 'new',
        processed: false,
        source: 'application_portal',
        // Additional metadata for HR filter
        hr_status: 'pending',
        hr_score: 0,
        hr_processed: false
      }
    };

    // Step 5: Store in Qdrant
    console.log('Storing in Qdrant...');
    const result = await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point]
    });

    console.log(`Application stored successfully with ID: ${applicationId}`);

    res.json({
      success: true,
      message: 'Application submitted successfully',
      application_id: applicationId,
      timestamp: point.payload.timestamp,
      details: {
        name,
        email,
        cv_filename: cvFile.originalname,
        cv_size: cvFile.size,
        qdrant_status: result.status
      }
    });

  } catch (error) {
    console.error('Error processing application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process application',
      error: error.message
    });
  }
});

// Get all applications (for testing/monitoring)
app.get('/api/applications', async (req, res) => {
  try {
    const result = await qdrant.scroll(COLLECTION_NAME, {
      limit: 100,
      with_payload: true,
      with_vector: false
    });

    const applications = result.points.map(point => ({
      id: point.id,
      name: point.payload.name,
      email: point.payload.email,
      cv_filename: point.payload.cv_metadata?.name,
      timestamp: point.payload.timestamp,
      status: point.payload.status,
      hr_processed: point.payload.hr_processed || false,
      hr_status: point.payload.hr_status || 'pending'
    }));

    res.json({
      success: true,
      count: applications.length,
      applications
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error.message
    });
  }
});

// Get specific application
app.get('/api/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await qdrant.retrieve(COLLECTION_NAME, {
      ids: [parseInt(id)],
      with_payload: true,
      with_vector: false
    });

    if (!result.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    const application = result[0];
    
    // Don't send full PDF base64
    const response = {
      id: application.id,
      name: application.payload.name,
      email: application.payload.email,
      cv_metadata: application.payload.cv_metadata,
      timestamp: application.payload.timestamp,
      status: application.payload.status,
      hr_status: application.payload.hr_status,
      hr_processed: application.payload.hr_processed,
      has_pdf: !!application.payload.cv_pdf_base64
    };

    res.json({
      success: true,
      application: response
    });

  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: error.message
    });
  }
});

// Simple embedding function (for demo)
function generateSimpleEmbedding(text) {
  // This is a simple hash-based embedding for demo purposes
  // In production, use a proper embedding model
  const embedding = new Array(384).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  words.forEach(word => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    
    const index = Math.abs(hash) % embedding.length;
    embedding[index] = (embedding[index] + 1) / (words.length + 1);
  });
  
  return embedding;
}

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const result = await qdrant.scroll(COLLECTION_NAME, {
      limit: 1000,
      with_payload: true,
      with_vector: false
    });

    const stats = {
      total: result.points.length,
      new: result.points.filter(p => p.payload.status === 'new').length,
      processed: result.points.filter(p => p.payload.hr_processed).length,
      by_day: {}
    };

    // Group by day
    result.points.forEach(point => {
      const date = new Date(point.payload.timestamp).toISOString().split('T')[0];
      stats.by_day[date] = (stats.by_day[date] || 0) + 1;
    });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// Start server
async function startServer() {
  try {
    // Check if collection exists, create if not
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      console.log(`Collection '${COLLECTION_NAME}' does not exist. Please run: npm run setup-qdrant`);
    }
    
    app.listen(port, () => {
      console.log(`=======================================`);
      console.log(`Job Application Portal`);
      console.log(`=======================================`);
      console.log(`Frontend: http://localhost:${port}`);
      console.log(`API: http://localhost:${port}/api`);
      console.log(`Health: http://localhost:${port}/api/health`);
      console.log(`Qdrant: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
      console.log(`Collection: ${COLLECTION_NAME}`);
      console.log(`=======================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
