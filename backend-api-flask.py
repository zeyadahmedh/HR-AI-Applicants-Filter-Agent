from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
from extract_text import extract_text_from_pdf, extract_text_from_docx
from preprocessing import preprocess_text
from similarity import similarity_score
from email_handler import send_email
from dotenv import load_dotenv
import re
import pandas as pd
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
UPLOAD_FOLDER = 'uploads'
JOB_DESC_FOLDER = 'job_descriptions'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc'}
THRESHOLD = 0.3

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(JOB_DESC_FOLDER, exist_ok=True)

EMAIL_USER = os.getenv("EMAIL")
EMAIL_PASS = os.getenv("PASSWORD")

# Store processed candidates in memory (use database in production)
processed_candidates = []

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "API is running"})

@app.route('/api/upload', methods=['POST'])
def upload_resume():
    """Upload and process a single resume"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    job_description = request.form.get('jobDescription', '')
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Only PDF and DOCX allowed"}), 400
    
    try:
        # Save file
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{timestamp}_{filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(file_path)
        
        # Extract text
        if filename.lower().endswith('.pdf'):
            resume_text = extract_text_from_pdf(file_path)
        elif filename.lower().endswith('.docx'):
            resume_text = extract_text_from_docx(file_path)
        else:
            return jsonify({"error": "Unsupported file format"}), 400
        
        # Extract email from resume
        email_match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", resume_text)
        candidate_email = email_match.group(0) if email_match else "No email found"
        
        # Calculate similarity if job description provided
        score = 0
        status = "pending"
        
        if job_description:
            preprocessed_job = preprocess_text(job_description)
            preprocessed_resume = preprocess_text(resume_text)
            score = similarity_score(preprocessed_job, preprocessed_resume)
            status = "matched" if score >= THRESHOLD else "rejected"
        
        # Store candidate info
        candidate_data = {
            "id": len(processed_candidates) + 1,
            "email": candidate_email,
            "filename": filename,
            "score": float(score),
            "status": status,
            "uploadDate": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "resumeText": resume_text[:500]  # First 500 chars for preview
        }
        processed_candidates.append(candidate_data)
        
        return jsonify({
            "success": True,
            "candidate": candidate_data
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload-batch', methods=['POST'])
def upload_batch():
    """Upload multiple resumes at once"""
    if 'files' not in request.files:
        return jsonify({"error": "No files provided"}), 400
    
    files = request.files.getlist('files')
    job_description = request.form.get('jobDescription', '')
    
    results = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                filename = secure_filename(file.filename)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                unique_filename = f"{timestamp}_{filename}"
                file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
                file.save(file_path)
                
                # Extract text
                if filename.lower().endswith('.pdf'):
                    resume_text = extract_text_from_pdf(file_path)
                elif filename.lower().endswith('.docx'):
                    resume_text = extract_text_from_docx(file_path)
                else:
                    continue
                
                # Extract email
                email_match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", resume_text)
                candidate_email = email_match.group(0) if email_match else "No email found"
                
                # Calculate similarity
                score = 0
                status = "pending"
                
                if job_description:
                    preprocessed_job = preprocess_text(job_description)
                    preprocessed_resume = preprocess_text(resume_text)
                    score = similarity_score(preprocessed_job, preprocessed_resume)
                    status = "matched" if score >= THRESHOLD else "rejected"
                
                candidate_data = {
                    "id": len(processed_candidates) + 1,
                    "email": candidate_email,
                    "filename": filename,
                    "score": float(score),
                    "status": status,
                    "uploadDate": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                processed_candidates.append(candidate_data)
                results.append(candidate_data)
                
            except Exception as e:
                print(f"Error processing {file.filename}: {e}")
                continue
    
    return jsonify({
        "success": True,
        "processed": len(results),
        "candidates": results
    })

@app.route('/api/candidates', methods=['GET'])
def get_candidates():
    """Get all processed candidates"""
    return jsonify({"candidates": processed_candidates})

@app.route('/api/filter', methods=['POST'])
def filter_candidates():
    """Apply filtering criteria to existing candidates"""
    data = request.json
    job_description = data.get('jobDescription', '')
    min_score = float(data.get('minScore', THRESHOLD))
    
    if not job_description:
        return jsonify({"error": "Job description required"}), 400
    
    # Reprocess all candidates with new job description
    for candidate in processed_candidates:
        file_path = os.path.join(UPLOAD_FOLDER, candidate['filename'])
        
        if os.path.exists(file_path):
            if candidate['filename'].lower().endswith('.pdf'):
                resume_text = extract_text_from_pdf(file_path)
            else:
                resume_text = extract_text_from_docx(file_path)
            
            preprocessed_job = preprocess_text(job_description)
            preprocessed_resume = preprocess_text(resume_text)
            score = similarity_score(preprocessed_job, preprocessed_resume)
            
            candidate['score'] = float(score)
            candidate['status'] = "matched" if score >= min_score else "rejected"
    
    return jsonify({
        "success": True,
        "candidates": processed_candidates
    })

@app.route('/api/send-emails', methods=['POST'])
def send_emails():
    """Send emails to all candidates"""
    data = request.json
    send_to = data.get('sendTo', 'all')  # 'all', 'matched', 'rejected'
    
    PASS_SUBJECT = "Interview Invitation for AI Engineer Role"
    PASS_BODY = """Dear Candidate,

We reviewed your resume and are excited to invite you to a meeting/interview.

Please reply with your available times.

Best regards,
HR Team"""
    
    REJECT_SUBJECT = "Application Update for AI Engineer Role"
    REJECT_BODY = """Dear Candidate,

Thank you for applying to the AI Engineer position.

After reviewing your resume, we regret to inform you that we will not be moving forward with your application at this time.

We appreciate your interest and encourage you to apply for future openings.

Best regards,
HR Team"""
    
    sent_count = 0
    
    for candidate in processed_candidates:
        if candidate['email'] == "No email found":
            continue
        
        if send_to == 'all' or send_to == candidate['status']:
            try:
                if candidate['status'] == 'matched':
                    send_email(EMAIL_USER, EMAIL_PASS, candidate['email'], PASS_SUBJECT, PASS_BODY)
                else:
                    send_email(EMAIL_USER, EMAIL_PASS, candidate['email'], REJECT_SUBJECT, REJECT_BODY)
                sent_count += 1
            except Exception as e:
                print(f"Failed to send email to {candidate['email']}: {e}")
    
    return jsonify({
        "success": True,
        "sent": sent_count
    })

@app.route('/api/export-csv', methods=['GET'])
def export_csv():
    """Export candidates report as CSV"""
    df = pd.DataFrame(processed_candidates)
    csv_path = 'candidates_report.csv'
    df.to_csv(csv_path, index=False)
    
    return send_file(csv_path, as_attachment=True, download_name='candidates_report.csv')

@app.route('/api/delete-candidate/<int:candidate_id>', methods=['DELETE'])
def delete_candidate(candidate_id):
    """Delete a candidate"""
    global processed_candidates
    processed_candidates = [c for c in processed_candidates if c['id'] != candidate_id]
    return jsonify({"success": True})

@app.route('/api/threshold', methods=['POST'])
def update_threshold():
    """Update the similarity threshold"""
    global THRESHOLD
    data = request.json
    THRESHOLD = float(data.get('threshold', 0.3))
    return jsonify({"success": True, "threshold": THRESHOLD})

if __name__ == '__main__':
    app.run(debug=True, port=5000)