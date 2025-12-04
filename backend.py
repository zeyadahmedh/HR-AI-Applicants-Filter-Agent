import os
import uuid
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct

# --- IMPORT YOUR CUSTOM MODULES ---
# We use the model from similarity.py to avoid loading it twice
from similarity import similarity_score, model 
from preprocessing import preprocess_text
from extract_text import extract_text_from_pdf, extract_text_from_docx
from email_handler import send_email

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "candidates")
EMAIL_USER = os.getenv("EMAIL")
EMAIL_PASS = os.getenv("PASSWORD")
THRESHOLD = 0.75  # Similarity threshold for acceptance

# --- Load Job Description ---
# We read the specific job description file you have in your repo
JD_PATH = os.path.join('job descriptions', 'ai_engineer.txt')

try:
    with open(JD_PATH, 'r', encoding='utf-8') as f:
        RAW_JOB_DESCRIPTION = f.read()
    print(f"Loaded Job Description from {JD_PATH}")
except FileNotFoundError:
    print(f"⚠️ Warning: Could not find {JD_PATH}. Using default.")
    RAW_JOB_DESCRIPTION = "AI Engineer with Python and Machine Learning skills."

# Preprocess JD once at startup
CLEANED_JD = preprocess_text(RAW_JOB_DESCRIPTION)


# --- Initialize Database ---
print(f"Connecting to Qdrant: {COLLECTION_NAME}...")
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)


@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        info = client.get_collection(COLLECTION_NAME)
        return jsonify({
            "success": True, 
            "message": "System Online", 
            "threshold": THRESHOLD,
            "candidates_stored": info.points_count
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/apply', methods=['POST'])
def apply():
    try:
        # 1. Get Candidate Info
        full_name = request.form.get('name', 'Unknown')
        email = request.form.get('email', '')
        file = request.files.get('cv')

        if not file:
            return jsonify({"success": False, "message": "No file uploaded"}), 400

        # 2. Save File
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)

        # 3. Extract Text (Using your extract_text.py)
        if filename.lower().endswith('.pdf'):
            resume_text = extract_text_from_pdf(file_path)
        elif filename.lower().endswith('.docx'):
            resume_text = extract_text_from_docx(file_path)
        else:
            return jsonify({"success": False, "message": "Unsupported file format"}), 400

        # 4. Preprocess & Filter (Using your preprocessing.py and similarity.py)
        print(f"Processing application for: {full_name}")
        cleaned_resume = preprocess_text(resume_text)
        
        # Calculate Score
        score = similarity_score(CLEANED_JD, cleaned_resume)
        print(f"Similarity Score: {score:.4f} (Threshold: {THRESHOLD})")

        # 5. Decision Logic
        if score < THRESHOLD:
            # REJECTION PATH
            print("❌ Candidate rejected. Sending rejection email...")
            
            # Send Email (Using your email_handler.py)
            if email and EMAIL_USER and EMAIL_PASS:
                subject = "Update regarding your application"
                body = f"Dear {full_name},\n\nThank you for your application. Unfortunately, we will not be moving forward at this time.\n\nBest regards,\nHR Team"
                send_email(EMAIL_USER, EMAIL_PASS, email, subject, body)

            return jsonify({
                "success": False,
                "message": f"Application declined based on AI screening. Score: {score:.2f}",
                "status": "rejected"
            })

        # SUCCESS PATH
        print("✅ Candidate matched! Saving to database...")
        
        # Generate Vector (using the model from similarity.py)
        # We re-encode the *original* text or cleaned text for the vector storage
        # usually cleaner to store vector of the cleaned text
        vector = model.encode(cleaned_resume).tolist()

        candidate_id = str(uuid.uuid4())
        name_parts = full_name.split()
        first_name = name_parts[0]
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        payload = {
            "candidate_id": candidate_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "status": "interviewing",
            "applied_date": datetime.date.today().isoformat(),
            "applied_job_title": "AI Engineer",
            "filename": filename,
            "skills": f"AI Match Score: {score:.2f}"
        }

        # Save to Qdrant
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[PointStruct(id=candidate_id, vector=vector, payload=payload)]
        )

        # Send Interview Email
        if email and EMAIL_USER and EMAIL_PASS:
            subject = "Interview Invitation"
            body = f"Dear {full_name},\n\nYour resume matches our requirements! We would like to invite you to an interview.\n\nBest regards,\nHR Team"
            send_email(EMAIL_USER, EMAIL_PASS, email, subject, body)

        return jsonify({
            "success": True, 
            "message": "Application accepted! Check your email.",
            "application_id": candidate_id,
            "score": score
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)