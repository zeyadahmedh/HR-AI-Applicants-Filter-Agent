const { QdrantClient } = require('@qdrant/js-client-rest');
const dotenv = require('dotenv');

dotenv.config();

const qdrant = new QdrantClient({
	url: process.env.QDRANT_URL || 'http://localhost:6333',
	apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION_NAME = 'job_applications';

async function setupQdrant() {
	try {
		console.log('Setting up Qdrant collection...');

		// Check if collection exists
		const collections = await qdrant.getCollections();
		const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

		if (exists) {
			console.log(`Collection '${COLLECTION_NAME}' already exists.`);
			return;
		}

		// Create collection with 384 dimensions (compatible with common embedding models)
		await qdrant.createCollection(COLLECTION_NAME, {
			vectors: {
				size: 384,
				distance: 'Cosine'
			},
			on_disk_payload: true
		});

		console.log(`Created collection: ${COLLECTION_NAME}`);

		// Create indexes for faster filtering
		await qdrant.createPayloadIndex(COLLECTION_NAME, {
			field_name: 'email',
			field_schema: 'keyword'
		});

		await qdrant.createPayloadIndex(COLLECTION_NAME, {
			field_name: 'status',
			field_schema: 'keyword'
		});

		await qdrant.createPayloadIndex(COLLECTION_NAME, {
			field_name: 'hr_processed',
			field_schema: 'bool'
		});

		console.log('Created payload indexes for email, status, and hr_processed');
		console.log('Qdrant setup completed successfully!');

	} catch (error) {
		console.error('Error setting up Qdrant:', error);
		process.exit(1);
	}
}

setupQdrant();
